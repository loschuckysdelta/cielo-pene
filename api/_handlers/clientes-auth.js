const { setCors, send, error, readBody, normalizeText } = require('../_lib/http');
const { collection, memory, memoryId, ensureIndexes } = require('../_lib/db');
const {
  hashPassword, verifyPassword, normalizeEmail, signClientToken,
  publicClient, findClientByEmail, currentClient, requireClient, CLIENT_COOKIE
} = require('../_lib/client-auth');
const { setHttpOnlyCookie, clearCookie, parseCookies } = require('../_lib/cookies');


const CLIENT_COOKIE_AGE = 60 * 60 * 24 * 30;

function rememberSession(body) {
  return body.remember !== false && body.remember !== 'false';
}

function setClientSession(req, res, client, remember = true) {
  const token = signClientToken(client);
  setHttpOnlyCookie(req, res, CLIENT_COOKIE, token, remember ? { maxAge: CLIENT_COOKIE_AGE } : {});
  return token;
}

function requestAction(req) {
  if (req.query && req.query.action) return String(req.query.action).toLowerCase();
  try {
    return String(new URL(req.url, 'http://localhost').searchParams.get('action') || '').toLowerCase();
  } catch (_) {
    return '';
  }
}

async function verifyGoogleCredential(credential) {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  if (!clientId) throw new Error('El inicio con Google todavía no está configurado.');
  if (!credential) throw new Error('Google no devolvió una credencial válida.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
      { signal: controller.signal }
    );
    if (!response.ok) throw new Error('Google rechazó la credencial. Inténtalo nuevamente.');
    const payload = await response.json();
    const validIssuer = payload.iss === 'accounts.google.com' || payload.iss === 'https://accounts.google.com';
    const validAudience = payload.aud === clientId;
    const validExpiry = Number(payload.exp || 0) * 1000 > Date.now();
    const verifiedEmail = payload.email_verified === 'true' || payload.email_verified === true;
    if (!validIssuer || !validAudience || !validExpiry || !verifiedEmail || !payload.sub || !payload.email) {
      throw new Error('No se pudo verificar tu cuenta de Google.');
    }
    return {
      googleSub: String(payload.sub),
      email: normalizeEmail(payload.email),
      nombre: normalizeText(payload.name || payload.given_name || 'Cliente'),
      foto: String(payload.picture || ''),
    };
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('Google tardó demasiado en responder. Inténtalo otra vez.');
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

async function findClientByGoogleSub(col, googleSub) {
  if (col) return col.findOne({ googleSub });
  return (memory.clientes || []).find(c => String(c.googleSub || '') === String(googleSub)) || null;
}

async function saveGoogleClient(col, googleProfile) {
  const now = new Date().toISOString();
  let client = await findClientByGoogleSub(col, googleProfile.googleSub);
  if (!client) client = await findClientByEmail(googleProfile.email);

  if (client) {
    if (client.activo === false) throw new Error('Esta cuenta está desactivada. Comunícate con la tienda.');
    const updates = {
      googleSub: googleProfile.googleSub,
      provider: client.provider || 'google',
      foto: googleProfile.foto || client.foto || '',
      lastAccess: now,
      updatedAt: now,
    };
    if (!client.nombre) updates.nombre = googleProfile.nombre;
    if (col) {
      await col.updateOne({ _id: client._id }, { $set: updates });
      return col.findOne({ _id: client._id });
    }
    Object.assign(client, updates);
    return client;
  }

  const doc = {
    nombre: googleProfile.nombre,
    email: googleProfile.email,
    telefono: '',
    provider: 'google',
    googleSub: googleProfile.googleSub,
    foto: googleProfile.foto,
    activo: true,
    createdAt: now,
    updatedAt: now,
    lastAccess: now,
  };

  if (col) {
    const result = await col.insertOne(doc);
    return { ...doc, _id: result.insertedId };
  }
  const saved = { ...doc, id: memoryId() };
  if (!Array.isArray(memory.clientes)) memory.clientes = [];
  memory.clientes.push(saved);
  return saved;
}

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  try {
    await ensureIndexes();
    const col = await collection('clientes');

    if (req.method === 'GET' && requestAction(req) === 'config') {
      const googleClientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
      return send(res, 200, {
        ok: true,
        data: { googleEnabled: Boolean(googleClientId), googleClientId }
      });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const accion = normalizeText(body.accion || 'login').toLowerCase();

      if (accion === 'logout') {
        clearCookie(req, res, CLIENT_COOKIE);
        return send(res, 200, { ok: true });
      }

      if (accion === 'google') {
        const profile = await verifyGoogleCredential(String(body.credential || ''));
        const saved = await saveGoogleClient(col, profile);
        setClientSession(req, res, saved, rememberSession(body));
        return send(res, 200, {
          ok: true,
          data: { client: publicClient(saved), sessionSaved: true }
        });
      }

      if (accion === 'registro') {
        const nombre = normalizeText(body.nombre);
        const email = normalizeEmail(body.email);
        const telefono = normalizeText(body.telefono);
        const password = String(body.password || '');
        if (!nombre) return error(res, 400, 'Escribe tu nombre completo.');
        if (!/^\S+@\S+\.\S+$/.test(email)) return error(res, 400, 'Escribe un correo válido.');
        if (!telefono) return error(res, 400, 'Escribe tu número de teléfono.');
        if (password.length < 8) return error(res, 400, 'La contraseña debe tener mínimo 8 caracteres.');
        if (await findClientByEmail(email)) return error(res, 409, 'Ya existe una cuenta con ese correo.');

        const now = new Date().toISOString();
        const doc = {
          nombre,
          email,
          telefono,
          passwordHash: hashPassword(password),
          provider: 'password',
          activo: true,
          createdAt: now,
          updatedAt: now,
          lastAccess: now
        };

        let saved;
        if (col) {
          const result = await col.insertOne(doc);
          saved = { ...doc, _id: result.insertedId };
        } else {
          saved = { ...doc, id: memoryId() };
          if (!Array.isArray(memory.clientes)) memory.clientes = [];
          memory.clientes.push(saved);
        }
        setClientSession(req, res, saved, rememberSession(body));
        return send(res, 201, { ok: true, data: { client: publicClient(saved), sessionSaved: true } });
      }

      const email = normalizeEmail(body.email);
      const password = String(body.password || '');
      const client = await findClientByEmail(email);
      if (client && !client.passwordHash && client.googleSub) {
        return error(res, 401, 'Esta cuenta usa Google. Pulsa “Continuar con Google”.');
      }
      if (!client || client.activo === false || !verifyPassword(password, client.passwordHash)) {
        return error(res, 401, 'Correo o contraseña incorrectos.');
      }
      const lastAccess = new Date().toISOString();
      if (col) await col.updateOne({ _id: client._id }, { $set: { lastAccess, updatedAt: lastAccess } });
      else client.lastAccess = lastAccess;
      client.lastAccess = lastAccess;
      setClientSession(req, res, client, rememberSession(body));
      return send(res, 200, { ok: true, data: { client: publicClient(client), sessionSaved: true } });
    }

    if (req.method === 'GET') {
      const client = await currentClient(req);
      if (!client) return error(res, 401, 'Sesión vencida. Inicia sesión nuevamente.');
      const hasCookie = Boolean(parseCookies(req)[CLIENT_COOKIE]);
      const hasLegacyBearer = String(req.headers.authorization || '').startsWith('Bearer ');
      if (!hasCookie && hasLegacyBearer) setClientSession(req, res, client, true);
      return send(res, 200, { ok: true, data: publicClient(client) });
    }

    if (req.method === 'PUT') {
      const client = await requireClient(req, res);
      if (!client) return;
      const body = await readBody(req);
      const updates = { updatedAt: new Date().toISOString() };
      if (body.nombre !== undefined) updates.nombre = normalizeText(body.nombre);
      if (body.telefono !== undefined) updates.telefono = normalizeText(body.telefono);
      if (body.password) {
        if (String(body.password).length < 8) return error(res, 400, 'La contraseña debe tener mínimo 8 caracteres.');
        updates.passwordHash = hashPassword(body.password);
        updates.provider = client.googleSub ? 'google+password' : 'password';
      }
      if (col) {
        await col.updateOne({ _id: client._id }, { $set: updates });
        const saved = await col.findOne({ _id: client._id });
        return send(res, 200, { ok: true, data: publicClient(saved) });
      }
      Object.assign(client, updates);
      return send(res, 200, { ok: true, data: publicClient(client) });
    }

    return error(res, 405, 'Método no permitido.');
  } catch (e) {
    if (e && e.code === 11000) return error(res, 409, 'Ya existe una cuenta con ese correo.');
    return error(res, 500, e.message || 'Error en la cuenta del cliente.');
  }
};
