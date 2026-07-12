const { setCors, send, error, readBody, normalizeText, toNumber } = require('./_lib/http');
const { collection, oid, publicDoc, publicList, memory, memoryId, ensureIndexes } = require('./_lib/db');

const ESTADOS = ['pendiente', 'aprobada', 'oculta'];

function clean(body, previous = {}) {
  const estrellas = Math.min(5, Math.max(1, Math.round(toNumber(body.estrellas ?? previous.estrellas, 5))));
  const estadoSolicitado = normalizeText(body.estado ?? previous.estado).toLowerCase();
  return {
    cliente: normalizeText(body.cliente ?? body.nombre ?? previous.cliente),
    productoId: normalizeText(body.productoId ?? previous.productoId),
    productoNombre: normalizeText(body.productoNombre ?? body.producto ?? previous.productoNombre),
    estrellas,
    comentario: normalizeText(body.comentario ?? previous.comentario),
    imagen: normalizeText(body.imagen ?? previous.imagen),
    estado: ESTADOS.includes(estadoSolicitado) ? estadoSolicitado : (previous.estado || 'pendiente'),
    updatedAt: new Date().toISOString()
  };
}

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  try {
    await ensureIndexes();
    const col = await collection('resenas');
    const id = req.query.id;

    if (req.method === 'GET') {
      const admin = req.query.admin === '1';
      const filtro = admin ? {} : { estado: 'aprobada' };
      if (col) {
        const docs = await col.find(filtro).sort({ createdAt: -1 }).limit(200).toArray();
        return send(res, 200, { ok: true, data: publicList(docs) });
      }
      const docs = memory.resenas
        .filter(r => admin || r.estado === 'aprobada')
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return send(res, 200, { ok: true, data: docs });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const data = clean(body);
      if (!data.cliente) return error(res, 400, 'Escribe el nombre del cliente.');
      if (!data.productoNombre && !data.productoId) return error(res, 400, 'Selecciona el producto reseñado.');
      if (data.comentario.length < 3) return error(res, 400, 'La reseña es demasiado corta.');
      data.estado = body.admin === true ? (ESTADOS.includes(data.estado) ? data.estado : 'aprobada') : 'pendiente';
      data.createdAt = new Date().toISOString();
      if (col) {
        const r = await col.insertOne(data);
        return send(res, 201, { ok: true, data: { ...data, id: String(r.insertedId) }, mensaje: 'Reseña enviada para aprobación.' });
      }
      const doc = { ...data, id: memoryId() };
      memory.resenas.push(doc);
      return send(res, 201, { ok: true, data: doc, mensaje: 'Reseña enviada para aprobación.' });
    }

    if (req.method === 'PUT') {
      if (!id) return error(res, 400, 'Falta id de reseña.');
      const body = await readBody(req);
      if (col) {
        const _id = oid(id);
        if (!_id) return error(res, 400, 'ID inválido.');
        const previous = await col.findOne({ _id });
        if (!previous) return error(res, 404, 'Reseña no encontrada.');
        const data = clean(body, previous);
        await col.updateOne({ _id }, { $set: data });
        return send(res, 200, { ok: true, data: publicDoc(await col.findOne({ _id })) });
      }
      const i = memory.resenas.findIndex(r => r.id === id);
      if (i < 0) return error(res, 404, 'Reseña no encontrada.');
      memory.resenas[i] = { ...memory.resenas[i], ...clean(body, memory.resenas[i]) };
      return send(res, 200, { ok: true, data: memory.resenas[i] });
    }

    if (req.method === 'DELETE') {
      if (!id) return error(res, 400, 'Falta id de reseña.');
      if (col) {
        const _id = oid(id);
        if (!_id) return error(res, 400, 'ID inválido.');
        await col.deleteOne({ _id });
        return send(res, 200, { ok: true });
      }
      memory.resenas = memory.resenas.filter(r => r.id !== id);
      return send(res, 200, { ok: true });
    }

    return error(res, 405, 'Método no permitido.');
  } catch (e) {
    return error(res, 500, e.message || 'Error en reseñas.');
  }
};
