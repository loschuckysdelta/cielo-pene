const { setCors, send, error, readBody, normalizeText } = require('./_lib/http');
const { collection, oid, publicList, publicDoc, memory, ensureIndexes } = require('./_lib/db');
const { requireClient } = require('./_lib/client-auth');

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  try {
    await ensureIndexes();
    const client = await requireClient(req, res);
    if (!client) return;
    const clienteId = String(client._id || client.id);
    const col = await collection('notificaciones');

    if (req.method === 'GET') {
      if (col) {
        const docs = await col.find({ clienteId }).sort({ createdAt: -1 }).limit(100).toArray();
        return send(res, 200, { ok: true, data: publicList(docs) });
      }
      const docs = (memory.notificaciones || []).filter(n => n.clienteId === clienteId).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return send(res, 200, { ok: true, data: docs });
    }

    if (req.method === 'PUT') {
      const body = await readBody(req);
      const accion = normalizeText(body.accion || 'leer').toLowerCase();
      const now = new Date().toISOString();
      if (accion === 'leer_todas') {
        if (col) await col.updateMany({ clienteId, read: false }, { $set: { read: true, updatedAt: now } });
        else (memory.notificaciones || []).forEach(n => { if (n.clienteId === clienteId) { n.read = true; n.updatedAt = now; } });
        return send(res, 200, { ok: true });
      }

      const id = normalizeText(body.id || req.query.id);
      if (!id) return error(res, 400, 'Falta el ID de la notificación.');
      if (col) {
        const _id = oid(id);
        if (!_id) return error(res, 400, 'ID inválido.');
        const result = await col.findOneAndUpdate({ _id, clienteId }, { $set: { read: true, updatedAt: now } }, { returnDocument: 'after' });
        if (!result) return error(res, 404, 'Notificación no encontrada.');
        return send(res, 200, { ok: true, data: publicDoc(result) });
      }
      const target = (memory.notificaciones || []).find(n => String(n.id) === id && n.clienteId === clienteId);
      if (!target) return error(res, 404, 'Notificación no encontrada.');
      target.read = true;
      target.updatedAt = now;
      return send(res, 200, { ok: true, data: target });
    }

    return error(res, 405, 'Método no permitido.');
  } catch (e) {
    return error(res, 500, e.message || 'Error en notificaciones.');
  }
};
