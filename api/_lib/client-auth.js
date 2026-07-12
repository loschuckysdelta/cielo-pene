const crypto = require('crypto');
const { collection, oid, publicDoc, memory } = require('./db');
const { hashPassword, verifyPassword, normalizeEmail } = require('./auth');

function clientSecret() {
  return process.env.CLIENT_AUTH_SECRET || `${process.env.AUTH_SECRET || process.env.ADMIN_PASSWORD || 'cielo-postres'}-clientes`;
}

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signClientToken(client) {
  const payload = {
    sub: String(client._id || client.id),
    kind: 'cliente',
    exp: Date.now() + 1000 * 60 * 60 * 24 * 30
  };
  const encoded = b64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', clientSecret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyClientToken(token) {
  try {
    const [encoded, signature] = String(token || '').split('.');
    if (!encoded || !signature) return null;
    const expected = crypto.createHmac('sha256', clientSecret()).update(encoded).digest('base64url');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (payload.kind !== 'cliente' || !payload.sub || Number(payload.exp) < Date.now()) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function publicClient(client) {
  if (!client) return null;
  const doc = publicDoc(client);
  delete doc.passwordHash;
  return doc;
}

function bearer(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

async function findClientById(id) {
  const col = await collection('clientes');
  if (col) {
    const _id = oid(id);
    return _id ? col.findOne({ _id }) : null;
  }
  return (memory.clientes || []).find(c => String(c.id) === String(id)) || null;
}

async function findClientByEmail(email) {
  const normalized = normalizeEmail(email);
  const col = await collection('clientes');
  if (col) return col.findOne({ email: normalized });
  return (memory.clientes || []).find(c => normalizeEmail(c.email) === normalized) || null;
}

async function currentClient(req) {
  const payload = verifyClientToken(bearer(req));
  if (!payload) return null;
  const client = await findClientById(payload.sub);
  if (!client || client.activo === false) return null;
  return client;
}

async function requireClient(req, res) {
  const client = await currentClient(req);
  if (!client) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'Inicia sesión en tu cuenta para continuar.' }));
    return null;
  }
  return client;
}

module.exports = {
  hashPassword,
  verifyPassword,
  normalizeEmail,
  signClientToken,
  publicClient,
  findClientById,
  findClientByEmail,
  currentClient,
  requireClient
};
