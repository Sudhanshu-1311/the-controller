const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, safeStorage, Notification, desktopCapturer, screen, powerMonitor, session, clipboard } = require('electron');
const { fork } = require('node:child_process');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const nativeFileTransfer = require('./file-transfer.cjs');
const { autoUpdater } = require('electron-updater');

const isBackgroundLaunch = process.argv.includes('--background');
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let mainWindow;
let tray;
let agent;
let quitting = false;
let restartTimer;
let restartAttempts = 0;
const intentionallyStoppedAgents = new WeakSet();
let presence = 'OFFLINE';
const queuedSignals = new Map();
const signalDeliveryTimers = new Map();
let settings = { keepRunningOnClose: true, startWithWindows: false, allowRemoteConnections: true, pauseRemoteAccess: false, authorizedDevices: [], authorizedControllerUids: [] };
let credentials = null;
let deviceIdentity = null;
let nativeInputProcess = null;
let nativeInputAuthorized = false;
let nativeClipboardAuthorized = false;
let inputRateWindow = Date.now();
let inputRateCount = 0;
let nativeInputRequestId = 0;
let nativeInputOutput = '';
let displayCaptureRequest = { displayId: null, includeAudio: false };
let activeCaptureDisplayId = null;
const nativeInputWaiters = new Map();
const heldRemoteKeys = new Set();
const heldRemoteButtons = new Set();
const allowedVirtualKeys = new Set([
  ...Array.from({ length: 10 }, (_, i) => 0x30 + i), ...Array.from({ length: 26 }, (_, i) => 0x41 + i),
  ...Array.from({ length: 10 }, (_, i) => 0x60 + i), ...Array.from({ length: 24 }, (_, i) => 0x70 + i),
  0x08,0x09,0x0d,0x10,0x11,0x12,0x13,0x14,0x1b,0x20,0x21,0x22,0x23,0x24,0x25,0x26,0x27,0x28,
  0x2c,0x2d,0x2e,0x6a,0x6b,0x6d,0x6e,0x6f,0x90,0x91,0xa0,0xa1,0xa2,0xa3,0xa4,0xa5,
  0x5b,0x5c,0xba,0xbb,0xbc,0xbd,0xbe,0xbf,0xc0,0xdb,0xdc,0xdd,0xde,
]);

function inputScriptPath() {
  return app.isPackaged ? path.join(process.resourcesPath, 'windows-input.ps1') : path.join(__dirname, 'windows-input.ps1');
}

function ensureNativeInputProcess() {
  if (process.platform !== 'win32') throw new Error('Native remote input is only available in the Windows desktop build.');
  if (nativeInputProcess && !nativeInputProcess.killed) return nativeInputProcess;
  const executable = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', inputScriptPath()], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  nativeInputProcess = child;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    nativeInputOutput += chunk;
    const lines = nativeInputOutput.split(/\r?\n/);
    nativeInputOutput = lines.pop() || '';
    for (const line of lines) {
      try {
        const response = JSON.parse(line);
        const waiter = nativeInputWaiters.get(response.id);
        if (!waiter) continue;
        nativeInputWaiters.delete(response.id);
        clearTimeout(waiter.timer);
        response.ok ? waiter.resolve(true) : waiter.reject(new Error('Windows rejected the native input event.'));
      } catch {}
    }
  });
  child.stderr.on('data', (chunk) => console.warn('Native input helper:', String(chunk).trim()));
  child.on('error', (error) => console.warn('Native input helper failed to start:', error.message));
  child.on('exit', () => {
    if (nativeInputProcess === child) nativeInputProcess = null;
    nativeInputAuthorized = false;
    heldRemoteKeys.clear();
    heldRemoteButtons.clear();
    for (const waiter of nativeInputWaiters.values()) { clearTimeout(waiter.timer); waiter.reject(new Error('Native input helper exited.')); }
    nativeInputWaiters.clear();
  });
  return child;
}

async function writeNativeInput(input) {
  const child = ensureNativeInputProcess();
  if (!child.stdin.writable) throw new Error('Native input service is unavailable.');
  const id = ++nativeInputRequestId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { nativeInputWaiters.delete(id); reject(new Error('Native input helper timed out.')); }, 3000);
    nativeInputWaiters.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ ...input, id }) + '\n', (error) => {
      if (!error) return;
      nativeInputWaiters.delete(id); clearTimeout(timer); reject(error);
    });
  });
}

function releaseNativeKeys() {
  if (!nativeInputProcess || nativeInputProcess.killed) { heldRemoteKeys.clear(); heldRemoteButtons.clear(); return Promise.resolve(true); }
  const release = writeNativeInput({ kind: 'releaseAll' }).catch(() => false);
  heldRemoteKeys.clear();
  heldRemoteButtons.clear();
  return release;
}

function releaseNativeInput() { const release = releaseNativeKeys(); nativeInputAuthorized = false; return release; }

function revokeRemoteInput() {
  const wasAuthorized = nativeInputAuthorized;
  void releaseNativeInput();
  if (wasAuthorized && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('desktop:system-event', { type: 'remote-input-revoked' });
}

async function validateAndSendRemoteInput(input) {
  if (!nativeInputAuthorized || !settings.allowRemoteConnections || settings.pauseRemoteAccess) throw new Error('Remote input is not authorized for this session.');
  if (!input || typeof input !== 'object') throw new Error('Invalid remote input event.');
  const now = Date.now();
  if (now - inputRateWindow >= 1000) { inputRateWindow = now; inputRateCount = 0; }
  const event = input.kind === 'releaseAll' ? { kind: 'releaseAll' } : (() => {
    if (input.kind === 'move' && Number.isFinite(input.x) && Number.isFinite(input.y) && input.x >= 0 && input.x <= 1 && input.y >= 0 && input.y <= 1) {
      const display = screen.getAllDisplays().find((item) => String(item.id) === activeCaptureDisplayId) || screen.getPrimaryDisplay();
      const topLeft = screen.dipToScreenPoint({ x: display.bounds.x, y: display.bounds.y });
      const bottomRight = screen.dipToScreenPoint({ x: display.bounds.x + display.bounds.width - 1, y: display.bounds.y + display.bounds.height - 1 });
      return { kind: 'move', x: Math.round(topLeft.x + input.x * (bottomRight.x - topLeft.x)), y: Math.round(topLeft.y + input.y * (bottomRight.y - topLeft.y)) };
    }
    if (input.kind === 'button' && ['left', 'right', 'middle'].includes(input.button) && typeof input.down === 'boolean') return { kind: 'button', button: input.button, down: input.down };
    if (input.kind === 'wheel' && Number.isInteger(input.delta) && Math.abs(input.delta) <= 1200) return { kind: 'wheel', delta: input.delta };
    if (input.kind === 'key' && Number.isInteger(input.key) && allowedVirtualKeys.has(input.key) && typeof input.down === 'boolean') return { kind: 'key', key: input.key, down: input.down };
    throw new Error('Remote input event failed validation.');
  })();
  const isRelease = (event.kind === 'key' || event.kind === 'button') && !event.down;
  if (event.kind !== 'releaseAll' && !isRelease) {
    inputRateCount += 1;
    if (inputRateCount > 240) throw new Error('Remote input rate limit exceeded.');
  }
  await writeNativeInput(event);
  if (event.kind === 'releaseAll') { heldRemoteKeys.clear(); heldRemoteButtons.clear(); }
  if (event.kind === 'key') event.down ? heldRemoteKeys.add(event.key) : heldRemoteKeys.delete(event.key);
  if (event.kind === 'button') event.down ? heldRemoteButtons.add(event.button) : heldRemoteButtons.delete(event.button);
  return true;
}

function readEncrypted(key) {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    const file = path.join(app.getPath('userData'), `${key}.bin`);
    return fs.existsSync(file) ? JSON.parse(safeStorage.decryptString(fs.readFileSync(file))) : null;
  } catch { return null; }
}

function writeEncrypted(key, value) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure credential storage is unavailable.');
  const file = path.join(app.getPath('userData'), `${key}.bin`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, safeStorage.encryptString(JSON.stringify(value)));
}

function getIdentity() {
  if (!deviceIdentity) {
    const id = crypto.randomUUID();
    const fingerprint = `FP-${crypto.createHash('sha256').update(`${process.env.COMPUTERNAME || 'windows'}|${id}`).digest('hex').slice(0, 16).toUpperCase()}`;
    deviceIdentity = { id, fingerprint, registeredAt: Date.now() };
    writeEncrypted('device-identity', deviceIdentity);
  }
  return deviceIdentity;
}

function emitState(state, details) {
  presence = state;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('agent:state', { state, details });
  if (tray) tray.setToolTip(`THE CONTROLLER — ${state}`);
}

function publishSettings() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('agent:settings', settings);
}

function deliverSignal(signalId, message) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isLoading() || mainWindow.webContents.isCrashed()) {
    queuedSignals.set(signalId, message);
    return;
  }
  mainWindow.webContents.send('agent:signal', { signalId, message });
  clearTimeout(signalDeliveryTimers.get(signalId));
  signalDeliveryTimers.set(signalId, setTimeout(() => {
    signalDeliveryTimers.delete(signalId);
    if (agent && !agent.killed) agent.send({ type: 'release-signal', signalId });
  }, 15000));
}

function flushSignals() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  for (const [signalId, message] of queuedSignals) mainWindow.webContents.send('agent:signal', { signalId, message });
  queuedSignals.clear();
}

function stopAgent() {
  return new Promise((resolve) => {
    if (!agent || agent.killed) { agent = null; emitState('OFFLINE'); resolve(); return; }
    const child = agent;
    intentionallyStoppedAgents.add(child);
    const timeout = setTimeout(() => { if (!child.killed) child.kill(); }, 8000);
    child.once('exit', () => { clearTimeout(timeout); if (agent === child) agent = null; emitState('OFFLINE'); resolve(); });
    child.send({ type: 'stop' });
  });
}

function startAgent() {
  console.log('[ELECTRON] startAgent() called');
  if (agent && !agent.killed) { agent.send({ type: 'retry' }); return; }
  if (!credentials || !deviceIdentity) { emitState('OFFLINE', 'Sign in to enable the background agent.'); return; }
  const workerPath = app.isPackaged
    ? path.join(process.resourcesPath, 'agent-daemon', 'agent-runtime.cjs')
    : path.join(__dirname, '..', 'agent-daemon', 'agent-runtime.cjs');
  agent = fork(workerPath, [], {
    detached: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  agent.unref();
  const child = agent;
  child.stdout?.on('data', (data) => console.log('[AGENT]', data.toString()));
  child.stderr?.on('data', (data) => console.error('[AGENT ERROR]', data.toString()));
  child.on('message', (message) => {
    console.log('[AGENT MESSAGE]', JSON.stringify(message));
    if (message?.type === 'state') {
      if (message.state === 'ONLINE' || message.state === 'REMOTE_ACCESS_PAUSED') restartAttempts = 0;
      emitState(message.state, message.details);
    } else if (message?.type === 'settings') {
      settings = { ...settings, ...message.settings };
      writeEncrypted('agent-settings', settings);
      if (!settings.allowRemoteConnections || settings.pauseRemoteAccess) revokeRemoteInput();
      publishSettings();
    } else if (message?.type === 'signal') {
      deliverSignal(message.signalId, message.message);
      if (message.message?.type === 'CONNECT_REQUEST' && (!mainWindow || !mainWindow.isVisible()) && Notification.isSupported()) {
        const notice = new Notification({ title: 'THE CONTROLLER', body: `${message.message.senderName} is requesting a remote session.` });
        notice.on('click', () => openWindow('agent'));
        notice.show();
      }
    }
  });
  child.on('exit', () => {
    if (agent === child) agent = null;
    if (intentionallyStoppedAgents.has(child) || quitting) return;
    emitState('RECONNECTING', 'Background process exited unexpectedly.');
    if (restartTimer) return;
    const delay = restartAttempts < 5 ? Math.min(30000, 2000 * (2 ** restartAttempts++)) : 300000;
    restartTimer = setTimeout(() => { restartTimer = null; startAgent(); }, delay);
  });
  console.log('[ELECTRON] sending start message to agent');
child.send(
  { type: 'start', credentials, firebaseConfig: credentials.firebaseConfig, identity: deviceIdentity, settings },
  (error) => {
    if (error) {
      console.error('[ELECTRON] agent IPC send failed:', error);
    } else {
      console.log('[ELECTRON] agent IPC start message sent');
    }
  }
);
}

function openWindow(section) {
  if (!mainWindow) createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('ui:open-section', section || 'restore');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 650,
    show: !isBackgroundLaunch,
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const devUrl = process.env.THE_CONTROLLER_DEV_URL;
  if (!app.isPackaged && devUrl) mainWindow.loadURL(devUrl);
  else mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
  mainWindow.webContents.on('did-finish-load', flushSignals);
  mainWindow.webContents.on('render-process-gone', () => {
    setTimeout(() => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reload(); }, 1000);
  });
  mainWindow.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    if (settings.keepRunningOnClose) mainWindow.hide();
    else void exitApplication();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

async function exitApplication() {
  if (quitting) return;
  quitting = true;
  await releaseNativeInput();
  nativeClipboardAuthorized = false;
  await stopAgent();
  await nativeFileTransfer.dispose();
  if (nativeInputProcess && !nativeInputProcess.killed) {
    const child = nativeInputProcess;
    child.stdin.end();
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 1500))]);
  }
  app.quit();
}

function createTray() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="8" fill="#0891b2"/><circle cx="16" cy="16" r="6" fill="none" stroke="white" stroke-width="3"/><circle cx="16" cy="16" r="2" fill="white"/></svg>';
  const icon = nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  tray = new Tray(icon);
  tray.setToolTip(`THE CONTROLLER — ${presence}`);
  const rebuildMenu = () => {
    const menu = Menu.buildFromTemplate([
      { label: 'THE CONTROLLER', enabled: false },
      { label: 'Open', click: () => openWindow() },
      { label: `Device Status — ${presence}`, click: () => openWindow('status') },
      { label: 'Settings', click: () => openWindow('settings') },
      { type: 'separator' },
      { label: settings.pauseRemoteAccess ? 'Resume Remote Access' : 'Pause Remote Access', click: () => {
        settings.pauseRemoteAccess = !settings.pauseRemoteAccess;
        writeEncrypted('agent-settings', settings);
        if (agent && !agent.killed) agent.send({ type: 'settings', settings });
        publishSettings();
        rebuildMenu();
      } },
      { type: 'separator' },
      { label: 'Exit THE CONTROLLER', click: () => void exitApplication() },
    ]);
    tray.setContextMenu(menu);
  };
  tray.on('click', () => openWindow());
  tray.on('right-click', rebuildMenu);
  rebuildMenu();
}

ipcMain.handle('desktop:identity', () => getIdentity());
ipcMain.handle('desktop:settings', () => settings);
ipcMain.handle('desktop:status', () => ({ state: presence }));
ipcMain.handle('desktop:credentials', (_event, value) => {
  if (credentials?.uid && credentials.uid !== value.uid) {
    return stopAgent().then(() => {
      credentials = value;
      writeEncrypted('firebase-credentials', credentials);
      startAgent();
      return true;
    });
  }
  credentials = value;
  writeEncrypted('firebase-credentials', credentials);
  if (agent && !agent.killed) agent.send({ type: 'credentials', credentials });
  else startAgent();
  return true;
});
ipcMain.handle('desktop:settings:update', (_event, updates) => {
  settings = { ...settings, ...updates };
  writeEncrypted('agent-settings', settings);
  app.setLoginItemSettings({ openAtLogin: Boolean(settings.startWithWindows), args: ['--background'] });
  if (agent && !agent.killed) agent.send({ type: 'settings', settings });
  if (!settings.allowRemoteConnections || settings.pauseRemoteAccess) revokeRemoteInput();
  if (!settings.allowRemoteConnections || settings.pauseRemoteAccess) nativeClipboardAuthorized = false;
  publishSettings();
  return settings;
});
ipcMain.handle('desktop:credentials:clear', async () => {
  credentials = null;
  try { fs.unlinkSync(path.join(app.getPath('userData'), 'firebase-credentials.bin')); } catch {}
  await stopAgent();
  return true;
});
ipcMain.handle('desktop:window:hide', () => { mainWindow?.hide(); });
ipcMain.handle('desktop:window:show', () => { if (!mainWindow) createWindow(); mainWindow.show(); mainWindow.focus(); });
ipcMain.handle('desktop:agent:start', () => { startAgent(); return true; });
ipcMain.handle('desktop:input:authorize', async (_event, allowed) => {
  if (allowed !== true) { await releaseNativeInput(); return false; }
  if (process.platform !== 'win32' || !settings.allowRemoteConnections || settings.pauseRemoteAccess) return false;
  ensureNativeInputProcess();
  await writeNativeInput({ kind: 'releaseAll' });
  nativeInputAuthorized = true;
  return true;
});
ipcMain.handle('desktop:input:event', (_event, input) => validateAndSendRemoteInput(input));
ipcMain.handle('desktop:input:release', () => { releaseNativeKeys(); return true; });
ipcMain.handle('desktop:capture:prepare', (_event, request) => {
  const selected = String(request?.displayId || screen.getPrimaryDisplay().id);
  const exists = screen.getAllDisplays().some((display) => String(display.id) === selected);
  displayCaptureRequest = { displayId: exists ? selected : String(screen.getPrimaryDisplay().id), includeAudio: request?.includeAudio === true };
  return true;
});
ipcMain.handle('desktop:clipboard:authorize', (_event, allowed) => {
  nativeClipboardAuthorized = allowed === true && process.platform === 'win32' && settings.allowRemoteConnections && !settings.pauseRemoteAccess;
  return nativeClipboardAuthorized;
});
ipcMain.handle('desktop:clipboard:read', () => {
  if (!nativeClipboardAuthorized) throw new Error('Clipboard sharing has not been authorized in Settings.');
  const value = clipboard.readText('clipboard');
  if (Buffer.byteLength(value, 'utf8') > 1024 * 1024) throw new Error('Clipboard text exceeds the 1 MiB transfer limit.');
  return value;
});
ipcMain.handle('desktop:clipboard:write', (_event, value) => {
  if (!nativeClipboardAuthorized) throw new Error('Clipboard sharing has not been authorized in Settings.');
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 1024 * 1024) throw new Error('Clipboard text is invalid or exceeds the 1 MiB limit.');
  clipboard.writeText(value, 'clipboard');
  return true;
});
ipcMain.handle('desktop:capture:primary', async (_event, includeAudio = false) => {
  const display = screen.getPrimaryDisplay();
  displayCaptureRequest = { displayId: String(display.id), includeAudio: includeAudio === true };
  return getDisplayCapture(display.id);
});
function getDisplayCapture(displayId) {
  const display = screen.getAllDisplays().find((item) => String(item.id) === String(displayId));
  if (!display) throw new Error('The selected display is no longer connected.');
  activeCaptureDisplayId = String(display.id);
  return desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } }).then((sources) => {
  const source = sources.find((item) => item.display_id === String(display.id));
  if (!source) throw new Error('Windows did not provide access to the selected display.');
  return { sourceId: source.id, displayId: String(display.id), width: display.size.width, height: display.size.height, scaleFactor: display.scaleFactor, label: display.label };
  });
}
ipcMain.handle('desktop:displays', () => screen.getAllDisplays().map((display) => ({ id: String(display.id), label: display.label || `Display ${display.id}`, width: display.size.width, height: display.size.height, scaleFactor: display.scaleFactor, bounds: display.bounds, primary: display.id === screen.getPrimaryDisplay().id })));
ipcMain.handle('desktop:capture:display', (_event, request) => {
  const id = typeof request === 'string' ? request : request?.id;
  displayCaptureRequest = { displayId: String(id), includeAudio: request?.includeAudio === true };
  return getDisplayCapture(id);
});
ipcMain.handle('desktop:files:select', () => nativeFileTransfer.selectFiles(mainWindow));
ipcMain.handle('desktop:files:read', (_event, id, offset, length) => nativeFileTransfer.readChunk(id, offset, length));
ipcMain.handle('desktop:files:release', (_event, id) => nativeFileTransfer.releaseSelectedFile(id));
ipcMain.handle('desktop:files:receive:begin', (_event, request) => nativeFileTransfer.beginReceive(mainWindow, request));
ipcMain.handle('desktop:files:receive:chunk', (_event, request) => nativeFileTransfer.writeChunk(request));
ipcMain.handle('desktop:files:receive:finish', (_event, id) => nativeFileTransfer.finishReceive(id));
ipcMain.handle('desktop:files:receive:cancel', (_event, id) => nativeFileTransfer.cancelReceive(id));
ipcMain.handle('desktop:section', (_event, section) => { openWindow(section); });
ipcMain.on('desktop:signal:ack', (_event, signalId) => {
  clearTimeout(signalDeliveryTimers.get(signalId));
  signalDeliveryTimers.delete(signalId);
  if (agent && !agent.killed) agent.send({ type: 'ack-signal', signalId });
});
ipcMain.handle('desktop:exit', () => exitApplication());

app.on('second-instance', () => openWindow());
app.on('before-quit', (event) => {
  if (!quitting && agent && !agent.killed) { event.preventDefault(); void exitApplication(); }
});

app.whenReady().then(() => {
  if (app.isPackaged) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on('checking-for-update', () => {
      mainWindow?.webContents.send('desktop:update:status', {
        status: 'checking',
      });
    });

    autoUpdater.on('update-available', (info) => {
      mainWindow?.webContents.send('desktop:update:status', {
        status: 'available',
        version: info.version,
      });
    });

    autoUpdater.on('update-not-available', () => {
      mainWindow?.webContents.send('desktop:update:status', {
        status: 'not-available',
      });
    });

    autoUpdater.on('download-progress', (progress) => {
      mainWindow?.webContents.send('desktop:update:status', {
        status: 'downloading',
        percent: progress.percent,
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      mainWindow?.webContents.send('desktop:update:status', {
        status: 'downloaded',
        version: info.version,
      });
    });

    autoUpdater.on('error', (error) => {
      mainWindow?.webContents.send('desktop:update:status', {
        status: 'error',
        message: error.message,
      });
    });
  }
  if (process.platform === 'win32') session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const display = screen.getAllDisplays().find((item) => String(item.id) === displayCaptureRequest.displayId) || screen.getPrimaryDisplay();
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
      const source = sources.find((item) => item.display_id === String(display.id));
      const includeAudio = displayCaptureRequest.includeAudio && request.audioRequested;
      displayCaptureRequest = { displayId: null, includeAudio: false };
      if (!source) return callback({});
      callback({ video: source, ...(includeAudio ? { audio: 'loopback' } : {}) });
    } catch { callback({}); }
  });
  credentials = readEncrypted('firebase-credentials');
  deviceIdentity = readEncrypted('device-identity');
  const saved = readEncrypted('agent-settings');
  if (saved) settings = { ...settings, ...saved };
  createTray();
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 10000);
  }
  const notifySystem = (type, details = {}) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('desktop:system-event', { type, details });
  };
  screen.on('display-metrics-changed', (_event, display, metrics) => notifySystem('display-changed', { displayId: String(display.id), metrics }));
  screen.on('display-added', (_event, display) => notifySystem('display-changed', { displayId: String(display.id) }));
  screen.on('display-removed', (_event, display) => notifySystem('display-changed', { displayId: String(display.id), removed: true }));
  powerMonitor.on('suspend', () => notifySystem('suspend'));
  powerMonitor.on('suspend', () => { if (nativeInputProcess && !nativeInputProcess.killed) void releaseNativeKeys(); });
  powerMonitor.on('resume', () => notifySystem('resume'));
  if (!isBackgroundLaunch) createWindow();
  app.setLoginItemSettings({ openAtLogin: Boolean(settings.startWithWindows), args: ['--background'] });
  if (credentials && deviceIdentity) startAgent();
});
// Desktop Google OAuth for Firebase authentication.
let googleOAuthInProgress = false;

ipcMain.handle('desktop:auth:google', async () => {
  if (googleOAuthInProgress) {
    throw new Error('Google sign-in is already in progress.');
  }

  googleOAuthInProgress = true;

  const http = require('node:http');
  const { shell } = require('electron');

  const clientId =
    '569847162349-2ul4ddn3lj2erb16vqc9p2jahgtvaa8i.apps.googleusercontent.com';

  const state = crypto.randomBytes(32).toString('hex');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');

  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  const server = http.createServer();

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Unable to create the Google OAuth callback server.');
    }

    const redirectUri =
      `http://127.0.0.1:${address.port}/oauth2callback`;

    const authorizationUrl = new URL(
      'https://accounts.google.com/o/oauth2/v2/auth'
    );

    authorizationUrl.searchParams.set('client_id', clientId);
    authorizationUrl.searchParams.set('redirect_uri', redirectUri);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', 'openid email profile');
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('code_challenge', codeChallenge);
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');
    authorizationUrl.searchParams.set('prompt', 'select_account');

    const result = await new Promise((resolve, reject) => {
      let finished = false;

      const finish = (error, value) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        server.removeListener('request', handleRequest);

        if (error) {
          reject(error);
        } else {
          resolve(value);
        }
      };

      const timeout = setTimeout(() => {
        finish(new Error('Google sign-in timed out.'));
      }, 5 * 60 * 1000);

      const handleRequest = async (req, res) => {
        try {
          const requestUrl = new URL(
            req.url || '/',
            redirectUri
          );

          if (requestUrl.pathname !== '/oauth2callback') {
            res.writeHead(404, {
              'Content-Type': 'text/plain; charset=utf-8',
            });
            res.end('Not found.');
            return;
          }

          const returnedState = requestUrl.searchParams.get('state');
          const code = requestUrl.searchParams.get('code');
          const error = requestUrl.searchParams.get('error');

          if (error) {
            res.writeHead(200, {
              'Content-Type': 'text/html; charset=utf-8',
            });

            res.end(`
              <!doctype html>
              <html>
                <head>
                  <meta charset="utf-8">
                  <title>THE CONTROLLER</title>
                </head>
                <body>
                  <h2>Google sign-in was cancelled.</h2>
                  <p>You can close this browser window.</p>
                </body>
              </html>
            `);

            finish(new Error(`Google OAuth error: ${error}`));
            return;
          }

          if (returnedState !== state) {
            res.writeHead(400, {
              'Content-Type': 'text/plain; charset=utf-8',
            });
            res.end('Invalid OAuth state.');

            finish(new Error('Invalid Google OAuth state.'));
            return;
          }

          if (!code) {
            res.writeHead(400, {
              'Content-Type': 'text/plain; charset=utf-8',
            });
            res.end('Missing authorization code.');

            finish(
              new Error('Google did not return an authorization code.')
            );
            return;
          }

          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
          });

          res.end(`
            <!doctype html>
            <html>
              <head>
                <meta charset="utf-8">
                <title>THE CONTROLLER</title>
              </head>
              <body>
                <h2>Google sign-in complete.</h2>
                <p>You can close this browser window and return to THE CONTROLLER.</p>
              </body>
            </html>
          `);

          const tokenResponse = await fetch(
            'https://oauth2.googleapis.com/token',
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({
                client_id: clientId,
                code,
                code_verifier: codeVerifier,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code',
                client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
              }),
            }
          );

          const tokenData = await tokenResponse.json();

          if (!tokenResponse.ok || !tokenData.id_token) {
            throw new Error(
              tokenData.error_description ||
              tokenData.error ||
              'Google token exchange failed.'
            );
          }

          finish(null, {
            idToken: tokenData.id_token,
            accessToken: tokenData.access_token || null,
          });
        } catch (error) {
          finish(error);
        }
      };

      server.on('request', handleRequest);

      shell.openExternal(authorizationUrl.toString()).catch((error) => {
        finish(error);
      });
    });

    return result;
  } finally {
    googleOAuthInProgress = false;

    try {
      server.close();
    } catch {}
  }
});
ipcMain.handle('desktop:update:check', async () => {
  if (!app.isPackaged) return { status: 'dev' };
  await autoUpdater.checkForUpdates();
  return { status: 'checking' };
});

ipcMain.handle('desktop:update:download', async () => {
  if (!app.isPackaged) return { status: 'dev' };
  await autoUpdater.downloadUpdate();
  return { status: 'downloading' };
});

ipcMain.handle('desktop:update:install', () => {
  if (!app.isPackaged) return false;
  autoUpdater.quitAndInstall();
  return true;
});