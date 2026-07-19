const { setCors, send, error, readBody, normalizeText, toBool } = require('../_lib/http');
const { collection, oid, publicList, publicDoc, memory, memoryId, ensureIndexes } = require('../_lib/db');
const {
  requireAuth, hashPassword, normalizeEmail, publicUser,
  effectivePermissions, ROLE_DEFAULTS, ALL_PERMISSIONS
} = require('../_lib/auth');

function sanitizePermissions(role, permissions) {
  if (role === 'principal') return [...ALL_PERMISSIONS];
  const incoming = Array.isArray(permissions) ? permissions : ROLE_DEFAULTS[role] || [];
  return [...new Set(incoming.filter(p => ALL_PERMISSIONS.includes(p)))];
}

function canCreateRole(actor, role) {
  if (role === 'principal') return false;
  if (actor.role === 'principal') return role === 'admin' || role === 'gestor';
  return role === 'admin' || role === 'gestor';
}

function present(user) {
  return { ...publicUser(user), permissions: effectivePermissions(user) };
}

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  try {
    await ensureIndexes();
    const auth = await requireAuth(req, res, 'usuarios');
    if (!auth) return;
    const actor = auth.user;
    const col = await collection('usuarios');
    const id = req.query.id;

    if (req.method === 'GET') {
      if (col) {
        const docs = await col.find({}).sort({ role: 1, nombre: 1 }).toArray();
        return send(res, 200, { ok: true, data: docs.map(present) });
      }
      return send(res, 200, { ok: true, data: (memory.usuarios || []).map(present) });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const nombre = normalizeText(body.nombre);
      const email = normalizeEmail(body.email);
      const password = String(body.password || '');
      const role = ['admin','gestor'].includes(body.role) ? body.role : 'gestor';
      if (!nombre) return error(res, 400, 'Escribe el nombre del usuario.');
      if (!/^\S+@\S+\.\S+$/.test(email)) return error(res, 400, 'Escribe un correo válido.');
      if (password.length < 8) return error(res, 400, 'La contraseña debe tener mínimo 8 caracteres.');
      if (!canCreateRole(actor, role)) return error(res, 403, 'No puedes crear ese tipo de usuario.');
      const permissions = sanitizePermissions(role, body.permissions);
      const now = new Date().toISOString();
      const doc = {
        nombre, email, passwordHash: hashPassword(password), role, permissions,
        activo: toBool(body.activo, true), createdAt: now, updatedAt: now, lastAccess: null,
        createdBy: String(actor._id || actor.id)
      };

      if (col) {
        const exists = await col.findOne({ email });
        if (exists) return error(res, 409, 'Ya existe un usuario con ese correo.');
        const result = await col.insertOne(doc);
        return send(res, 201, { ok: true, data: present({ ...doc, _id: result.insertedId }) });
      }
      if ((memory.usuarios || []).some(u => normalizeEmail(u.email) === email)) return error(res, 409, 'Ya existe un usuario con ese correo.');
      const saved = { ...doc, id: memoryId() };
      memory.usuarios.push(saved);
      return send(res, 201, { ok: true, data: present(saved) });
    }

    if (req.method === 'PUT') {
      if (!id) return error(res, 400, 'Falta el ID del usuario.');
      const body = await readBody(req);
      let target;
      if (col) {
        const _id = oid(id);
        if (!_id) return error(res, 400, 'ID inválido.');
        target = await col.findOne({ _id });
      } else {
        target = (memory.usuarios || []).find(u => String(u.id) === String(id));
      }
      if (!target) return error(res, 404, 'Usuario no encontrado.');
      if (target.role === 'principal' && String(target._id || target.id) !== String(actor._id || actor.id)) {
        return error(res, 403, 'El administrador principal no puede ser modificado por otro usuario.');
      }

      const updates = { updatedAt: new Date().toISOString() };
      if (body.nombre !== undefined) updates.nombre = normalizeText(body.nombre);
      if (body.email !== undefined) {
        const email = normalizeEmail(body.email);
        if (!/^\S+@\S+\.\S+$/.test(email)) return error(res, 400, 'Escribe un correo válido.');
        updates.email = email;
      }
      if (body.password) {
        if (String(body.password).length < 8) return error(res, 400, 'La contraseña debe tener mínimo 8 caracteres.');
        updates.passwordHash = hashPassword(body.password);
      }
      if (target.role !== 'principal') {
        const role = ['admin','gestor'].includes(body.role) ? body.role : target.role;
        updates.role = role;
        updates.permissions = sanitizePermissions(role, body.permissions);
        updates.activo = toBool(body.activo, target.activo !== false);
      }

      if (col) {
        if (updates.email) {
          const duplicate = await col.findOne({ email: updates.email, _id: { $ne: target._id } });
          if (duplicate) return error(res, 409, 'Ya existe un usuario con ese correo.');
        }
        await col.updateOne({ _id: target._id }, { $set: updates });
        const saved = await col.findOne({ _id: target._id });
        return send(res, 200, { ok: true, data: present(saved) });
      }
      Object.assign(target, updates);
      return send(res, 200, { ok: true, data: present(target) });
    }

    if (req.method === 'DELETE') {
      if (!id) return error(res, 400, 'Falta el ID del usuario.');
      if (String(id) === String(actor._id || actor.id)) return error(res, 400, 'No puedes eliminar tu propia cuenta.');
      if (col) {
        const _id = oid(id);
        if (!_id) return error(res, 400, 'ID inválido.');
        const target = await col.findOne({ _id });
        if (!target) return error(res, 404, 'Usuario no encontrado.');
        if (target.role === 'principal') return error(res, 403, 'No se puede eliminar al administrador principal.');
        await col.deleteOne({ _id });
        return send(res, 200, { ok: true });
      }
      const target = (memory.usuarios || []).find(u => String(u.id) === String(id));
      if (!target) return error(res, 404, 'Usuario no encontrado.');
      if (target.role === 'principal') return error(res, 403, 'No se puede eliminar al administrador principal.');
      memory.usuarios = memory.usuarios.filter(u => String(u.id) !== String(id));
      return send(res, 200, { ok: true });
    }

    return error(res, 405, 'Método no permitido.');
  } catch (e) {
    return error(res, 500, e.message || 'Error en usuarios.');
  }
};
