const { setCors, send, error, readBody, normalizeText } = require('./_lib/http');
const { collection, oid, memory, memoryId, ensureIndexes } = require('./_lib/db');
const {
  hashPassword, verifyPassword, normalizeEmail, signClientToken,
  publicClient, findClientByEmail, currentClient, requireClient
} = require('./_lib/client-auth');

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  try {
    await ensureIndexes();
    const col = await collection('clientes');

    if (req.method === 'POST') {
      const body = await readBody(req);
      const accion = normalizeText(body.accion || 'login').toLowerCase();

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
        return send(res, 201, { ok: true, data: { token: signClientToken(saved), client: publicClient(saved) } });
      }

      const email = normalizeEmail(body.email);
      const password = String(body.password || '');
      const client = await findClientByEmail(email);
      if (!client || client.activo === false || !verifyPassword(password, client.passwordHash)) {
        return error(res, 401, 'Correo o contraseña incorrectos.');
      }
      const lastAccess = new Date().toISOString();
      if (col) await col.updateOne({ _id: client._id }, { $set: { lastAccess, updatedAt: lastAccess } });
      else client.lastAccess = lastAccess;
      client.lastAccess = lastAccess;
      return send(res, 200, { ok: true, data: { token: signClientToken(client), client: publicClient(client) } });
    }

    if (req.method === 'GET') {
      const client = await currentClient(req);
      if (!client) return error(res, 401, 'Sesión vencida. Inicia sesión nuevamente.');
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
