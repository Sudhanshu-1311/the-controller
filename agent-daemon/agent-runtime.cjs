const os = require('node:os');

const requestTimeoutMs = 15000;
const heartbeatMs = 30000;
const maxFastRetries = 5;
let bootstrap;
let stopping = false;
let wakeLoop;
let settings = {};
let idToken;
let tokenExpiresAt = 0;
let activeState = 'STARTING';
let agentTask;
let settingsChanged = false;
let forceRetry = false;
const pendingSignals = new Map();

function report(state, details) {
  activeState = state;

  if (process.connected) {
    try {
      process.send({ type: 'state', state, details });
    } catch {
      // Electron disconnected; keep the agent from crashing.
    }
  }
}

function wait(ms) {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);
    wakeLoop = () => { clearTimeout(timeout); resolve(); };
  });
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Backend request failed (${response.status}): ${body}`);
    } 
    return response.status === 204 ? null : response.json();
  } finally { clearTimeout(timeout); }
}

async function refreshAuthentication() {
  report('AUTHENTICATING', 'Refreshing secure Firebase credentials');
  const form = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: bootstrap.credentials.refreshToken });
  const response = await request(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(bootstrap.firebaseConfig.apiKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
  });
  if (response.user_id !== bootstrap.credentials.uid) throw new Error('Credential identity mismatch');
  idToken = response.id_token;
  tokenExpiresAt = Date.now() + Number(response.expires_in || 3600) * 1000;
  console.log('[AGENT AUTH] Firebase UID:', response.user_id);
  console.log('[AGENT AUTH] Bootstrap UID:', bootstrap.credentials.uid); 
}

function field(value) {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return { integerValue: String(Math.trunc(value)) };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(field) } };
  if (value && typeof value === 'object') {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, field(entry)])) } };
  }
  return { nullValue: null };
}

async function writePresence(state) {
  if (!idToken || Date.now() > tokenExpiresAt - 300000) await refreshAuthentication();
  report(state === 'ONLINE' || state === 'REMOTE_ACCESS_PAUSED' ? 'REGISTERING' : state, 'Publishing authenticated device presence');
  const project = bootstrap.firebaseConfig.projectId;
  const deviceId = encodeURIComponent(bootstrap.identity.id);
  const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/devices/${deviceId}`;
  const data = {
    identity: bootstrap.identity,
    ownerUid: bootstrap.credentials.uid,
    name: bootstrap.settings.deviceName || os.hostname(),
    role: 'agent',
    status: 'Offline',
    presenceState: state,
    lastSeen: Date.now(),
    remoteAccessPaused: Boolean(bootstrap.settings.pauseRemoteAccess),
    allowRemoteConnections: bootstrap.settings.allowRemoteConnections !== false,
    authorizedControllerUids: bootstrap.settings.authorizedControllerUids || [],
  };
  const fields = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, field(value)]));
  const mask = Object.keys(fields).map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`).join('&');
  await request(`${url}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

function decodeValue(value) {
  if (!value || value.nullValue !== undefined) return null;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return Number(value.doubleValue);
  if (value.arrayValue) return (value.arrayValue.values || []).map(decodeValue);
  if (value.mapValue) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, entry]) => [key, decodeValue(entry)]));
  return null;
}

async function pollSignals() {
  if (!idToken || Date.now() > tokenExpiresAt - 300000) await refreshAuthentication();
  const project = bootstrap.firebaseConfig.projectId;
  const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents:runQuery`;
  const response = await request(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'signals' }],
      where: { fieldFilter: { field: { fieldPath: 'targetId' }, op: 'EQUAL', value: { stringValue: bootstrap.identity.id } } },
      limit: 50,
    } }),
  });
  for (const result of response) {
    if (!result.document) continue;
    const doc = result.document;
    const id = doc.name.split('/').pop();
    const message = decodeValue(doc.fields?.message);
    if (message?.id && process.connected && !pendingSignals.has(id)) {
      pendingSignals.set(id, doc.name);
      process.send({ type: 'signal', signalId: id, message });
    }
  }
}

async function refreshRemotePermissions() {
  const project = bootstrap.firebaseConfig.projectId;
  const deviceId = encodeURIComponent(bootstrap.identity.id);
  const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/devices/${deviceId}`;
  const document = await request(url, { headers: { Authorization: `Bearer ${idToken}` } });
  const fields = document.fields || {};
  const latest = {
    ...settings,
    authorizedControllerUids: decodeValue(fields.authorizedControllerUids) || [],
    allowRemoteConnections: decodeValue(fields.allowRemoteConnections) !== false,
    pauseRemoteAccess: Boolean(decodeValue(fields.remoteAccessPaused)),
  };
  if (JSON.stringify(latest) !== JSON.stringify(settings)) {
    settings = latest;
    bootstrap.settings = latest;
    if (process.connected) process.send({ type: 'settings', settings: latest });
    settingsChanged = true;
  }
}

async function acknowledgeSignal(signalId) {
  const resourceName = pendingSignals.get(signalId);
  if (!resourceName) return;
  const url = `https://firestore.googleapis.com/v1/${resourceName}`;
  try {
    await request(url, { method: 'DELETE', headers: { Authorization: `Bearer ${idToken}` } });
    pendingSignals.delete(signalId);
  } catch (error) {
    pendingSignals.delete(signalId);
    throw error;
  }
}

async function setPresence(state) {
  await writePresence(state);
  report(state, state === 'ONLINE' ? 'Authenticated backend presence is active' : undefined);
}

async function runAgent() {
  let failures = 0;
  let lastNetworkSignature = '';
  let registered = false;
  let lastHeartbeat = 0;
  let lastPermissionCheck = 0;
  let previousCycle = Date.now();
  while (!stopping) {
    try {
      const now = Date.now();
      if (now - previousCycle > 20000) {
        report('RECONNECTING', 'System resume detected; revalidating network and backend credentials');
        idToken = null;
        registered = false;
      }
      previousCycle = now;
      if (forceRetry) { failures = 0; idToken = null; registered = false; forceRetry = false; }
      if (!idToken || Date.now() > tokenExpiresAt - 300000) {
        report('AUTHENTICATING', 'Refreshing secure Firebase credentials');
        await refreshAuthentication();
      }

      if (!registered) {
        report('REGISTERING', 'Registering device with Firebase');
        await writePresence('REGISTERING');
        await pollSignals();
        registered = true;
      } else {
        await pollSignals();
      }
      if (!settingsChanged && (!lastPermissionCheck || Date.now() - lastPermissionCheck >= heartbeatMs)) {
        await refreshRemotePermissions();
        lastPermissionCheck = Date.now();
      }
      const desired = bootstrap.settings.pauseRemoteAccess || bootstrap.settings.allowRemoteConnections === false ? 'REMOTE_ACCESS_PAUSED' : 'ONLINE';
      if (settingsChanged || !lastHeartbeat || Date.now() - lastHeartbeat >= heartbeatMs || activeState !== desired) {
        await writePresence(desired);
        lastHeartbeat = Date.now();
        settingsChanged = false;
        report(desired, desired === 'ONLINE' ? 'Authenticated presence and signaling are active' : 'Device authenticated; remote access is disabled or paused');
      }

      const networkSignature = JSON.stringify(os.networkInterfaces());
      if (lastNetworkSignature && networkSignature !== lastNetworkSignature) {
        report('RECONNECTING', 'Network changed; validating backend connection');
        idToken = null;
        registered = false;
      }
      lastNetworkSignature = networkSignature;
      failures = 0;
      await wait(5000);
    } catch (error) {
      failures += 1;
      report('RECONNECTING', error?.message || 'Backend connection interrupted');
      idToken = null;
      registered = false;
      const delay = failures <= maxFastRetries ? Math.min(60000, 2000 * (2 ** (failures - 1))) : 300000;
      if (failures === maxFastRetries + 1) report('OFFLINE', 'Retry limit reached; retrying at a reduced rate');
      await wait(delay);
    }
  }
}

async function stopAgent() {
  stopping = true;
  wakeLoop?.();
  try { await agentTask; } catch {}
  report('STOPPING', 'Marking device offline');
  try {
    if (idToken && Date.now() < tokenExpiresAt) await writePresence('OFFLINE');
    else if (bootstrap?.credentials?.refreshToken) { await refreshAuthentication(); await writePresence('OFFLINE'); }
  } catch { /* Backend may already be unreachable; the server expires stale presence. */ }
  report('OFFLINE', 'Background agent stopped');
  process.disconnect?.();
  process.exit(0);
}

process.on('message', (message) => {
  if (message?.type === 'start' && !bootstrap) {
    bootstrap = message;
    settings = bootstrap.settings || {};
    agentTask = runAgent();
  } else if (message?.type === 'settings' && bootstrap) {
    settings = { ...settings, ...message.settings };
    bootstrap.settings = settings;
    settingsChanged = true;
    wakeLoop?.();
  } else if (message?.type === 'retry' && bootstrap) {
    forceRetry = true;
    wakeLoop?.();
  } else if (message?.type === 'credentials' && bootstrap) {
    bootstrap.credentials = message.credentials;
    bootstrap.firebaseConfig = message.credentials.firebaseConfig;
    idToken = null;
    wakeLoop?.();
  } else if (message?.type === 'ack-signal') {
    void acknowledgeSignal(message.signalId).catch(() => {});
  } else if (message?.type === 'release-signal') {
    pendingSignals.delete(message.signalId);
  } else if (message?.type === 'stop') {
    void stopAgent();
  }
});

process.on('disconnect', () => {
  // Keep running if the UI/main process crashes; the login agent can reconnect later.
});
