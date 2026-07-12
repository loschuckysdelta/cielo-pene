const { setCors, send, error } = require('./_lib/http');
const { collection, publicList, memory, ensureIndexes } = require('./_lib/db');
const { requireClient } = require('./_lib/client-auth');

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  try {
    await ensureIndexes();
    if (req.method !== 'GET') return error(res, 405, 'Método no permitido.');
    const client = await requireClient(req, res);
    if (!client) return;
    const clienteId = String(client._id || client.id);
    const col = await collection('pedidos');
    if (col) {
      const docs = await col.find({ clienteId }).sort({ createdAt: -1 }).limit(100).toArray();
      return send(res, 200, { ok: true, data: publicList(docs) });
    }
    const docs = (memory.pedidos || []).filter(p => String(p.clienteId || '') === clienteId).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return send(res, 200, { ok: true, data: docs });
  } catch (e) {
    return error(res, 500, e.message || 'Error cargando tus pedidos.');
  }
};
