const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineString, defineSecret } = require('firebase-functions/params');
const crypto = require('node:crypto');
const logger = require('firebase-functions/logger');

initializeApp();
const db = getFirestore();
const stunUrls = defineString('STUN_URLS', { default: '' });
const turnUrls = defineString('TURN_URLS', { default: '' });
const turnSharedSecret = defineSecret('TURN_SHARED_SECRET');

exports.getIceConfiguration = onCall(
  { region: 'us-central1', secrets: [turnSharedSecret] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to request ICE configuration.');
    const urls = (value) => value.split(',').map((url) => url.trim()).filter(Boolean);
    const iceServers = urls(stunUrls.value()).map((url) => {
      if (!url.startsWith('stun:') && !url.startsWith('stuns:')) throw new HttpsError('failed-precondition', 'STUN_URLS contains an unsupported URL.');
      return { urls: url };
    });
    const configuredTurnUrls = urls(turnUrls.value());
    if (!configuredTurnUrls.length) return { iceServers, turnAvailable: false };
    if (configuredTurnUrls.some((url) => !url.startsWith('turn:') && !url.startsWith('turns:'))) {
      throw new HttpsError('failed-precondition', 'TURN_URLS must contain turn: or turns: URLs.');
    }
    const secret = turnSharedSecret.value();
    if (!secret) throw new HttpsError('failed-precondition', 'TURN URLs are configured without TURN_SHARED_SECRET.');
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const username = `${expiry}:${request.auth.uid}`;
    const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');
    iceServers.push({ urls: configuredTurnUrls, username, credential });
    return { iceServers, turnAvailable: true, expiresAt: expiry };
  }
);

// A crashed or sleeping client cannot leave the backend permanently ONLINE.
exports.expireStaleDevicePresence = onSchedule(
  { schedule: 'every 1 minutes', region: 'us-central1', timeZone: 'UTC' },
  async () => {
    const cutoff = Date.now() - 90000;
    const staleDevices = await db.collection('devices')
      .where('presenceState', 'in', ['ONLINE', 'RECONNECTING', 'REMOTE_ACCESS_PAUSED'])
      .where('lastSeen', '<', cutoff)
      .limit(450)
      .get();
    if (staleDevices.empty) return;

    const batch = db.batch();
    staleDevices.docs.forEach((device) => batch.update(device.ref, {
      presenceState: 'OFFLINE',
      status: 'Offline',
      presenceExpiredAt: Date.now(),
    }));
    await batch.commit();
    logger.info('Expired stale device presence', { count: staleDevices.size });
  }
);

exports.expireOldSignals = onSchedule(
  { schedule: 'every 5 minutes', region: 'us-central1', timeZone: 'UTC' },
  async () => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    const oldSignals = await db.collection('signals').where('createdAt', '<', cutoff).limit(450).get();
    if (oldSignals.empty) return;
    const batch = db.batch();
    oldSignals.docs.forEach((signal) => batch.delete(signal.ref));
    await batch.commit();
    logger.info('Removed expired signaling messages', { count: oldSignals.size });
  }
);
