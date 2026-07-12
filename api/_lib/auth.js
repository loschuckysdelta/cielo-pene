const crypto = require('crypto');
const { collection, oid, publicDoc, memory, memoryId } = require('./db');

const ALL_PERMISSIONS = [
  'dashboard','productos','categorias','pedidos','resenas','cupones',
  'delivery','configuracion','usuarios','reportes','herramientas','apis'
];

const ROLE_DEFAULTS = {
  principal: [...ALL_PERMISSIONS],
  admin: ['dashboard','productos','categorias','pedidos','resenas','cupones','delivery','configuracion','reportes','apis'],
  gestor: ['dashboard']
};

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [kind, salt, hash] = String(stored || '').split('$');
    if (kind !== 'scrypt' || !salt || !hash) return false;
    const candidate = crypto.scryptSync(String(password), salt, 64);
    const original = Buffer.from(hash, 'hex');
    return candidate.length === original.length && crypto.timingSafeEqual(candidate, original);
  } catch (_) {
    return false;
  }
}

function tokenSecret() {
  return process.env.AUTH_SECRET || process.env.ADMIN_PASSWORD || 'cielo-postres-cambia-esta-clave';
}

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signToken(user) {
  const payload = {
    sub: String(user._id || user.id),
    role: user.role,
    exp: Date.now() + 1000 * 60 * 60 * 12
  };
  const encoded = b64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', tokenSecret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyToken(token) {
  try {
    const [encoded, signature] = String(token || '').split('.');
    if (!encoded || !signature) return null;
    const expected = crypto.createHmac('sha256', tokenSecret()).update(encoded).digest('base64url');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload.sub || Number(payload.exp) < Date.now()) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function publicUser(user) {
  if (!user) return null;
  const doc = publicDoc(user);
  delete doc.passwordHash;
  return doc;
}

function effectivePermissions(user) {
  if (!user) return [];
  if (user.role === 'principal') return [...ALL_PERMISSIONS];
  const values = Array.isArray(user.permissions) ? user.permissions : ROLE_DEFAULTS[user.role] || [];
  return [...new Set(values.filter(p => ALL_PERMISSIONS.includes(p)))];
}

async function ensureBootstrapUser() {
  const col = await collection('usuarios');
  const email = normalizeEmail(process.env.ADMIN_EMAIL || 'admin@cielopostres.com');
  const password = process.env.ADMIN_PASSWORD || 'Chucky123';
  const now = new Date().toISOString();

  if (col) {
    let user = await col.findOne({ role: 'principal' });
    if (!user) {
      const doc = {
        nombre: 'Administrador principal',
        email,
        passwordHash: hashPassword(password),
        role: 'principal',
        permissions: [...ALL_PERMISSIONS],
        activo: true,
        createdAt: now,
        updatedAt: now,
        lastAccess: null
      };
      const result = await col.insertOne(doc);
      user = { ...doc, _id: result.insertedId };
    }
    return user;
  }

  if (!Array.isArray(memory.usuarios)) memory.usuarios = [];
  let user = memory.usuarios.find(u => u.role === 'principal');
  if (!user) {
    user = {
      id: memoryId(),
      nombre: 'Administrador principal',
      email,
      passwordHash: hashPassword(password),
      role: 'principal',
      permissions: [...ALL_PERMISSIONS],
      activo: true,
      createdAt: now,
      updatedAt: now,
      lastAccess: null
    };
    memory.usuarios.push(user);
  }
  return user;
}

async function findUserById(id) {
  const col = await collection('usuarios');
  if (col) {
    const _id = oid(id);
    return _id ? col.findOne({ _id }) : null;
  }
  return (memory.usuarios || []).find(u => String(u.id) === String(id)) || null;
}

async function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  const col = await collection('usuarios');
  if (col) return col.findOne({ email: normalized });
  return (memory.usuarios || []).find(u => normalizeEmail(u.email) === normalized) || null;
}

async function updateLastAccess(user) {
  const lastAccess = new Date().toISOString();
  const col = await collection('usuarios');
  if (col) {
    await col.updateOne({ _id: user._id }, { $set: { lastAccess } });
  } else {
    user.lastAccess = lastAccess;
  }
  return lastAccess;
}

function bearer(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

async function currentUser(req) {
  await ensureBootstrapUser();
  const payload = verifyToken(bearer(req));
  if (!payload) return null;
  const user = await findUserById(payload.sub);
  if (!user || user.activo === false) return null;
  return user;
}

async function requireAuth(req, res, permission) {
  const user = await currentUser(req);
  if (!user) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'Sesión vencida o no autorizada.' }));
    return null;
  }
  const permissions = effectivePermissions(user);
  if (permission && !permissions.includes(permission)) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'No tienes permiso para realizar esta acción.' }));
    return null;
  }
  return { user, permissions };
}

module.exports = {
  ALL_PERMISSIONS,
  ROLE_DEFAULTS,
  normalizeEmail,
  hashPassword,
  verifyPassword,
  signToken,
  publicUser,
  effectivePermissions,
  ensureBootstrapUser,
  findUserById,
  findUserByEmail,
  updateLastAccess,
  currentUser,
  requireAuth
};
