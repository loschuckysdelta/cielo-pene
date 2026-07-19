const { setCors, send, error, readBody, normalizeText, toBool, toNumber } = require('../_lib/http');
const { collection, oid, publicDoc, publicList, memory, memoryId, ensureIndexes } = require('../_lib/db');
const cloud = require('../_lib/cloudinary');

async function clean(body, previous = null) {
  let imagen = normalizeText(body.imagen);
  if (!imagen && previous?.imagen) imagen = previous.imagen;
  if (imagen.startsWith('data:image/')) {
    imagen = await cloud.uploadBase64(imagen, 'cielo_postres/categorias');
  }
  return {
    nombre: normalizeText(body.nombre),
    icono: normalizeText(body.icono) || '🍰',
    imagen,
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
    const id = req.query?.id;

    if (req.method === 'GET') {
      const docs = col
        ? await col.find({}).sort({ orden: 1, nombre: 1 }).toArray()
        : [...memory.categorias].sort((a,b) => (a.orden||0)-(b.orden||0) || String(a.nombre).localeCompare(String(b.nombre)));
      return send(res, 200, { ok: true, data: col ? publicList(docs) : docs });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const data = await clean(body);
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
      if (col) {
        const _id = oid(id);
        if (!_id) return error(res, 400, 'ID inválido.');
        const previous = await col.findOne({ _id });
        if (!previous) return error(res, 404, 'Categoría no encontrada.');
        const data = await clean(body, previous);
        if (!data.nombre) return error(res, 400, 'La categoría necesita nombre.');
        await col.updateOne({ _id }, { $set: data });
        return send(res, 200, { ok: true, data: publicDoc(await col.findOne({ _id })) });
      }
      const i = memory.categorias.findIndex(x => x.id === id);
      if (i < 0) return error(res, 404, 'Categoría no encontrada.');
      const data = await clean(body, memory.categorias[i]);
      if (!data.nombre) return error(res, 400, 'La categoría necesita nombre.');
      memory.categorias[i] = { ...memory.categorias[i], ...data };
      return send(res, 200, { ok: true, data: memory.categorias[i] });
    }

    if (req.method === 'DELETE') {
      if (!id) return error(res, 400, 'Falta id de categoría.');
      if (col) {
        const _id = oid(id);
        if (!_id) return error(res, 400, 'ID inválido.');
        await col.deleteOne({ _id });
      } else {
        memory.categorias = memory.categorias.filter(x => x.id !== id);
      }
      return send(res, 200, { ok: true });
    }

    return error(res, 405, 'Método no permitido.');
  } catch (e) {
    return error(res, 500, e.message || 'Error en categorías.');
  }
};
