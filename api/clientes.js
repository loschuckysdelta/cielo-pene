const { setCors, send, error, readBody, normalizeText, toBool } = require('./_lib/http');
const { collection, oid, publicList, publicDoc, memory, ensureIndexes } = require('./_lib/db');
const { requireAuth } = require('./_lib/auth');
const { publicClient } = require('./_lib/client-auth');

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  try {
    await ensureIndexes();
    const auth = await requireAuth(req, res, 'clientes');
    if (!auth) return;
    const col = await collection('clientes');
    const pedidosCol = await collection('pedidos');
    const id = normalizeText(req.query.id);

    if (req.method === 'GET') {
      let clients;
      if (col) clients = await col.find({}).sort({ createdAt: -1 }).limit(500).toArray();
      else clients = [...(memory.clientes || [])].sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));

      const data = [];
      for (const client of clients) {
        const clienteId = String(client._id || client.id);
        let pedidos = 0;
        if (pedidosCol) pedidos = await pedidosCol.countDocuments({ clienteId });
        else pedidos = (memory.pedidos || []).filter(p => String(p.clienteId || '') === clienteId).length;
        data.push({ ...publicClient(client), pedidos });
      }
      return send(res, 200, { ok: true, data });
    }

    if (req.method === 'PUT') {
      if (!id) return error(res, 400, 'Falta el ID del cliente.');
      const body = await readBody(req);
      const activo = toBool(body.activo, true);
      const now = new Date().toISOString();
      if (col) {
        const _id = oid(id);
        if (!_id) return error(res, 400, 'ID inválido.');
        await col.updateOne({ _id }, { $set: { activo, updatedAt: now } });
        const saved = await col.findOne({ _id });
        if (!saved) return error(res, 404, 'Cliente no encontrado.');
        return send(res, 200, { ok: true, data: publicClient(saved) });
      }
      const target = (memory.clientes || []).find(c => String(c.id) === id);
      if (!target) return error(res, 404, 'Cliente no encontrado.');
      target.activo = activo;
      target.updatedAt = now;
      return send(res, 200, { ok: true, data: publicClient(target) });
    }

    return error(res, 405, 'Método no permitido.');
  } catch (e) {
    return error(res, 500, e.message || 'Error en clientes.');
  }
};
