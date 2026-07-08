const { setCors, send, error, readBody, normalizeText, toBool, toNumber } = require('./_lib/http');
const { collection, oid, publicDoc, publicList, memory, memoryId } = require('./_lib/db');

function clean(body) {
  const tipoPrecio = normalizeText(body.tipoPrecio) || 'fijo';
  return {
    nombre: normalizeText(body.nombre),
    descripcion: normalizeText(body.descripcion),
    precio: Math.max(0, toNumber(body.precio, 0)),
    tipoPrecio: ['fijo', 'coordinar'].includes(tipoPrecio) ? tipoPrecio : 'fijo',
    activo: toBool(body.activo, true),
    disponible: toBool(body.disponible, true),
    orden: toNumber(body.orden, 0),
    updatedAt: new Date().toISOString()
  };
}

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  try {
    const col = await collection('delivery');
    const id = req.query.id;

    if (req.method === 'GET') {
      const admin = req.query.admin === '1';
      if (col) {
        const filtro = admin ? {} : { activo: true };
        const docs = await col.find(filtro).sort({ orden: 1, nombre: 1 }).toArray();
        return send(res, 200, { ok: true, data: publicList(docs) });
      }
      const docs = (admin ? memory.delivery : memory.delivery.filter(z => z.activo)).sort((a,b)=>(a.orden||0)-(b.orden||0));
      return send(res, 200, { ok: true, data: docs });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const data = clean(body);
      if (!data.nombre) return error(res, 400, 'La zona necesita nombre.');
      data.createdAt = new Date().toISOString();
      if (col) {
        const r = await col.insertOne(data);
        return send(res, 201, { ok: true, data: { ...data, id: String(r.insertedId) } });
      }
      const doc = { ...data, id: memoryId() };
      memory.delivery.push(doc);
      return send(res, 201, { ok: true, data: doc });
    }

    if (req.method === 'PUT') {
      if (!id) return error(res, 400, 'Falta id de zona.');
      const body = await readBody(req);
      const data = clean(body);
      if (col) {
        const _id = oid(id);
        if (!_id) return error(res, 400, 'ID inválido.');
        await col.updateOne({ _id }, { $set: data });
        const doc = await col.findOne({ _id });
        return send(res, 200, { ok: true, data: publicDoc(doc) });
      }
      const i = memory.delivery.findIndex(x => x.id === id);
      if (i < 0) return error(res, 404, 'Zona no encontrada.');
      memory.delivery[i] = { ...memory.delivery[i], ...data };
      return send(res, 200, { ok: true, data: memory.delivery[i] });
    }

    if (req.method === 'DELETE') {
      if (!id) return error(res, 400, 'Falta id de zona.');
      if (col) {
        const _id = oid(id);
        if (!_id) return error(res, 400, 'ID inválido.');
        await col.deleteOne({ _id });
        return send(res, 200, { ok: true });
      }
      memory.delivery = memory.delivery.filter(x => x.id !== id);
      return send(res, 200, { ok: true });
    }

    return error(res, 405, 'Método no permitido.');
  } catch (e) {
    return error(res, 500, e.message || 'Error en delivery.');
  }
};
