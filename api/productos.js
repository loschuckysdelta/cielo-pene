const { setCors, send, error, readBody, normalizeText, toBool, toNumber } = require('./_lib/http');
const { collection, oid, publicDoc, publicList, memory, memoryId, ensureIndexes } = require('./_lib/db');
const { uploadMany } = require('./_lib/cloudinary');

async function findCategoriaName(categoriaId, categoriaNombre) {
  if (categoriaNombre) return categoriaNombre;
  if (!categoriaId) return '';
  const col = await collection('categorias');
  if (col) {
    const _id = oid(categoriaId);
    if (_id) {
      const cat = await col.findOne({ _id });
      if (cat) return cat.nombre;
    }
  } else {
    const cat = memory.categorias.find(c => c.id === categoriaId);
    if (cat) return cat.nombre;
  }
  return '';
}

async function clean(body, oldDoc) {
  const nuevos = Array.isArray(body.imagenesNuevas) ? body.imagenesNuevas : [];
  let imagenes = Array.isArray(body.imagenes) ? body.imagenes.filter(Boolean) : (oldDoc?.imagenes || []);
  if (nuevos.length > 0) imagenes = [...imagenes, ...await uploadMany(nuevos)];

  const stock = Math.max(0, Math.floor(toNumber(body.stock, oldDoc?.stock || 0)));
  const categoriaId = normalizeText(body.categoriaId || body.categoria || oldDoc?.categoriaId);
  const categoriaNombre = await findCategoriaName(categoriaId, normalizeText(body.categoriaNombre || oldDoc?.categoriaNombre));

  return {
    nombre: normalizeText(body.nombre || oldDoc?.nombre),
    categoriaId,
    categoriaNombre,
    descripcion: normalizeText(body.descripcion || body.desc || oldDoc?.descripcion),
    precio: Math.max(0, toNumber(body.precio, oldDoc?.precio || 0)),
    stock,
    descuento: Math.max(0, toNumber(body.descuento, oldDoc?.descuento || 0)),
    activo: toBool(body.activo, oldDoc ? oldDoc.activo : true) && stock > 0,
    destacado: toBool(body.destacado, oldDoc ? oldDoc.destacado : false),
    imagenes: imagenes.slice(0, 5),
    updatedAt: new Date().toISOString()
  };
}

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  try {
    await ensureIndexes();
    const col = await collection('productos');
    const id = req.query.id;

    if (req.method === 'GET') {
      const includeInactive = req.query.admin === '1' || req.query.all === '1';
      if (col) {
        const filtro = includeInactive ? {} : { activo: { $ne: false } };
        const docs = await col.find(filtro).sort({ destacado: -1, categoriaNombre: 1, nombre: 1 }).toArray();
        return send(res, 200, { ok: true, data: publicList(docs) });
      }
      const docs = (includeInactive ? memory.productos : memory.productos.filter(p => p.activo !== false))
        .sort((a,b) => Number(b.destacado)-Number(a.destacado) || String(a.categoriaNombre).localeCompare(String(b.categoriaNombre)) || String(a.nombre).localeCompare(String(b.nombre)));
      return send(res, 200, { ok: true, data: docs });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const data = await clean(body, null);
      if (!data.nombre) return error(res, 400, 'El producto necesita nombre.');
      if (!data.categoriaId && !data.categoriaNombre) return error(res, 400, 'El producto necesita categoría.');
      if (data.precio <= 0) return error(res, 400, 'El precio debe ser mayor a 0.');
      data.createdAt = new Date().toISOString();
      if (col) {
        const r = await col.insertOne(data);
        return send(res, 201, { ok: true, data: { ...data, id: String(r.insertedId) } });
      }
      const doc = { ...data, id: memoryId() };
      memory.productos.push(doc);
      return send(res, 201, { ok: true, data: doc });
    }

    if (req.method === 'PUT') {
      if (!id) return error(res, 400, 'Falta id de producto.');
      const body = await readBody(req);
      if (col) {
        const _id = oid(id);
        if (!_id) return error(res, 400, 'ID inválido.');
        const oldDoc = await col.findOne({ _id });
        if (!oldDoc) return error(res, 404, 'Producto no encontrado.');
        const data = await clean(body, oldDoc);
        if (!data.nombre) return error(res, 400, 'El producto necesita nombre.');
        if (data.precio <= 0) return error(res, 400, 'El precio debe ser mayor a 0.');
        await col.updateOne({ _id }, { $set: data });
        const doc = await col.findOne({ _id });
        return send(res, 200, { ok: true, data: publicDoc(doc) });
      }
      const i = memory.productos.findIndex(x => x.id === id);
      if (i < 0) return error(res, 404, 'Producto no encontrado.');
      const data = await clean(body, memory.productos[i]);
      memory.productos[i] = { ...memory.productos[i], ...data };
      return send(res, 200, { ok: true, data: memory.productos[i] });
    }

    if (req.method === 'DELETE') {
      if (!id) return error(res, 400, 'Falta id de producto.');
      if (col) {
        const _id = oid(id);
        if (!_id) return error(res, 400, 'ID inválido.');
        await col.deleteOne({ _id });
        return send(res, 200, { ok: true });
      }
      memory.productos = memory.productos.filter(x => x.id !== id);
      return send(res, 200, { ok: true });
    }

    return error(res, 405, 'Método no permitido.');
  } catch (e) {
    return error(res, 500, e.message || 'Error en productos.');
  }
};
