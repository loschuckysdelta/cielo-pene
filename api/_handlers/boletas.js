const { setCors, send, error } = require('../_lib/http');
const { collection, oid, memory, publicDoc } = require('../_lib/db');
const { requireClient } = require('../_lib/client-auth');

function metadata(doc) {
  if (!doc) return null;
  const value = publicDoc(doc);
  delete value.pdfBase64;
  return value;
}

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  try {
    const client = await requireClient(req, res);
    if (!client) return;
    const clienteId = String(client._id || client.id || '');
    const col = await collection('boletas');
    const id = String(req.query.id || '');

    if (req.method !== 'GET') return error(res, 405, 'Método no permitido.');

    if (!id) {
      const docs = col
        ? await col.find({ clienteId }).project({ pdfBase64: 0 }).sort({ createdAt: -1 }).limit(100).toArray()
        : (memory.boletas || []).filter(b => String(b.clienteId) === clienteId).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return send(res, 200, { ok: true, data: docs.map(metadata) });
    }

    const doc = col
      ? await col.findOne({ _id: oid(id), clienteId })
      : (memory.boletas || []).find(b => String(b.id) === id && String(b.clienteId) === clienteId);
    if (!doc) return error(res, 404, 'Boleta no encontrada.');

    const buffer = Buffer.from(String(doc.pdfBase64 || ''), 'base64');
    if (!buffer.length) return error(res, 500, 'El PDF de la boleta está vacío.');
    const filename = String(doc.nombreArchivo || 'boleta.pdf').replace(/[^A-Za-z0-9._-]/g, '-');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.end(buffer);
  } catch (err) {
    return error(res, err.statusCode || 500, err.message || 'No se pudo obtener la boleta.');
  }
};
