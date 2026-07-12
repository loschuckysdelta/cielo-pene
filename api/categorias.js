const { setCors, send, error, readBody, normalizeText, toBool, toNumber } = require('./_lib/http');
const { collection, oid, publicDoc, publicList, memory, memoryId, ensureIndexes } = require('./_lib/db');

function clean(body) {
  return {
    nombre: normalizeText(body.nombre),
    icono: normalizeText(body.icono) || '🍰',
    orden: toNumber(body.orden, 0),
    activo: toBool(body.activo, true),
    updatedAt: new Date().toISOString()
  };
}

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  try {
    await ensureIndexes();
    const col = await collection('categorias');
    const id = req.query.id;

    if (req.method === 'GET') {
      if (col) {
        const docs = await col.find({}).sort({ orden: 1, nombre: 1 }).toArray();
        return send(res, 200, { ok: true, data: publicList(docs) });
      }
      const docs = [...memory.categorias].sort((a,b) => (a.orden||0)-(b.orden||0) || String(a.nombre).localeCompare(String(b.nombre)));
      return send(res, 200, { ok: true, data: docs });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const data = clean(body);
      if (!data.nombre) return error(res, 400, 'La categoría necesita nombre.');
      data.createdAt = new Date().toISOString();
      if (col) {
        const r = await col.insertOne(data);
        return send(res, 201, { ok: true, data: { ...data, id: String(r.insertedId) } });
      }
      const doc = { ...data, id: memoryId() };
      memory.categorias.push(doc);
      return send(res, 201, { ok: true, data: doc });
    }

    if (req.method === 'PUT') {
      if (!id) return error(res, 400, 'Falta id de categoría.');
      const body = await readBody(req);
      const data = clean(body);
      if (!data.nombre) return error(res, 400, 'La categoría necesita nombre.');
      if (col) {
        const _id = oid(id);
        if (!_id) return error(res, 400, 'ID inválido.');
        await col.updateOne({ _id }, { $set: data });
        const doc = await col.findOne({ _id });
        return send(res, 200, { ok: true, data: publicDoc(doc) });
      }
      const i = memory.categorias.findIndex(x => x.id === id);
      if (i < 0) return error(res, 404, 'Categoría no encontrada.');
      memory.categorias[i] = { ...memory.categorias[i], ...data };
      return send(res, 200, { ok: true, data: memory.categorias[i] });
    }

    if (req.method === 'DELETE') {
      if (!id) return error(res, 400, 'Falta id de categoría.');
      if (col) {
        const _id = oid(id);
        if (!_id) return error(res, 400, 'ID inválido.');
        await col.deleteOne({ _id });
        return send(res, 200, { ok: true });
      }
      memory.categorias = memory.categorias.filter(x => x.id !== id);
      return send(res, 200, { ok: true });
    }

    return error(res, 405, 'Método no permitido.');
  } catch (e) {
    return error(res, 500, e.message || 'Error en categorías.');
  }
};
