const { collection, memory, memoryId } = require('./db');

let webpush;
let vapidReady = false;

function config() {
  return {
    publicKey: String(process.env.VAPID_PUBLIC_KEY || '').trim(),
    privateKey: String(process.env.VAPID_PRIVATE_KEY || '').trim(),
    subject: String(process.env.VAPID_SUBJECT || 'mailto:admin@cielopostres.com').trim()
  };
}

function isConfigured() {
  const cfg = config();
  return Boolean(cfg.publicKey && cfg.privateKey && cfg.subject);
}

function getWebPush() {
  if (!isConfigured()) return null;
  if (!webpush) webpush = require('web-push');
  if (!vapidReady) {
    const cfg = config();
    webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
    vapidReady = true;
  }
  return webpush;
}

function normalizeSubscription(value) {
  const subscription = value && typeof value === 'object' ? value : {};
  const endpoint = String(subscription.endpoint || '').trim();
  const p256dh = String(subscription.keys?.p256dh || '').trim();
  const auth = String(subscription.keys?.auth || '').trim();
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, expirationTime: subscription.expirationTime || null, keys: { p256dh, auth } };
}

async function saveSubscription(clienteId, subscription, userAgent = '') {
  const clean = normalizeSubscription(subscription);
  if (!clean) throw new Error('Suscripción de notificaciones inválida.');
  const now = new Date().toISOString();
  const col = await collection('pushSubscriptions');
  const doc = {
    clienteId: String(clienteId),
    endpoint: clean.endpoint,
    subscription: clean,
    userAgent: String(userAgent || '').slice(0, 500),
    activo: true,
    updatedAt: now
  };
  if (col) {
    const before = await col.findOne({ endpoint: clean.endpoint });
    await col.updateOne(
      { endpoint: clean.endpoint },
      { $set: doc, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );
    return { created: !before, subscription: clean };
  }
  if (!Array.isArray(memory.pushSubscriptions)) memory.pushSubscriptions = [];
  let item = memory.pushSubscriptions.find(x => x.endpoint === clean.endpoint);
  const created = !item;
  if (!item) {
    item = { id: memoryId(), createdAt: now };
    memory.pushSubscriptions.push(item);
  }
  Object.assign(item, doc);
  return { created, subscription: clean };
}

async function deleteSubscription(clienteId, endpoint) {
  const cleanEndpoint = String(endpoint || '').trim();
  if (!cleanEndpoint) return false;
  const col = await collection('pushSubscriptions');
  if (col) {
    const result = await col.deleteOne({ clienteId: String(clienteId), endpoint: cleanEndpoint });
    return result.deletedCount > 0;
  }
  if (!Array.isArray(memory.pushSubscriptions)) memory.pushSubscriptions = [];
  const before = memory.pushSubscriptions.length;
  memory.pushSubscriptions = memory.pushSubscriptions.filter(x => !(x.clienteId === String(clienteId) && x.endpoint === cleanEndpoint));
  return memory.pushSubscriptions.length < before;
}

async function subscriptionsForClient(clienteId) {
  const col = await collection('pushSubscriptions');
  if (col) return col.find({ clienteId: String(clienteId), activo: { $ne: false } }).toArray();
  return (memory.pushSubscriptions || []).filter(x => x.clienteId === String(clienteId) && x.activo !== false);
}

async function removeBroken(item) {
  const col = await collection('pushSubscriptions');
  if (col) return col.deleteOne({ endpoint: item.endpoint });
  memory.pushSubscriptions = (memory.pushSubscriptions || []).filter(x => x.endpoint !== item.endpoint);
}

async function sendPushToClient(clienteId, payload) {
  const sender = getWebPush();
  if (!sender || !clienteId) return { sent: 0, failed: 0, configured: Boolean(sender) };
  const rows = await subscriptionsForClient(clienteId);
  let sent = 0;
  let failed = 0;
  await Promise.all(rows.map(async row => {
    try {
      await sender.sendNotification(row.subscription, JSON.stringify(payload), {
        TTL: 60 * 60 * 24,
        urgency: 'high',
        topic: String(payload.tag || 'cielo-postres').slice(0, 32),
        timeout: 5000
      });
      sent += 1;
    } catch (e) {
      failed += 1;
      const status = Number(e?.statusCode || 0);
      if (status === 404 || status === 410) await removeBroken(row).catch(() => null);
      else console.warn('Push notification error:', e?.message || e);
    }
  }));
  return { sent, failed, configured: true };
}

module.exports = {
  isConfigured,
  publicKey: () => config().publicKey,
  saveSubscription,
  deleteSubscription,
  sendPushToClient
};
