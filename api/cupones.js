const { setCors, send, error, readBody, normalizeText, toBool, toNumber } = require('./_lib/http');
const { collection, oid, publicDoc, publicList, memory, memoryId } = require('./_lib/db');

function clean(body) {
  const tipo = normalizeText(body.tipo) || 'porcentaje';
  return {
    codigo: normalizeText(body.codigo).toUpperCase(),
    tipo: ['porcentaje', 'monto'].includes(tipo) ? tipo : 'porcentaje',
    valor: Math.max(0, toNumber(body.valor, 0)),
    activo: toBool(body.activo, true),
    descripcion: normalizeText(body.descripcion),
    updatedAt: new Date().toISOString()
  };
}

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  try {
    const col = await collection('cupones');
    const id = req.query.id;
    if (req.method === 'GET') {
      const admin = req.query.admin === '1';
      if (col) {
        const filtro = admin ? {} : { activo: true };
        const docs = await col.find(filtro).sort({ codigo: 1 }).toArray();
        return send(res, 200, { ok: true, data: publicList(docs) });
      }
      const docs = admin ? memory.cupones : memory.cupones.filter(c => c.activo);
      return send(res, 200, { ok: true, data: docs });
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const data = clean(body);
      if (!data.codigo) return error(res, 400, 'El cupón necesita código.');
      if (data.valor <= 0) return error(res, 400, 'El cupón necesita valor mayor a 0.');
      data.createdAt = new Date().toISOString();
      if (col) {
        const r = await col.insertOne(data);
        return send(res, 201, { ok: true, data: { ...data, id: String(r.insertedId) } });
      }
      const doc = { ...data, id: memoryId() };
      memory.cupones.push(doc);
      return send(res, 201, { ok: true, data: doc });
    }
    if (req.method === 'PUT') {
      if (!id) return error(res, 400, 'Falta id de cupón.');
      const body = await readBody(req);
      const data = clean(body);
      if (col) {
        const _id = oid(id);
        if (!_id) return error(res, 400, 'ID inválido.');
        await col.updateOne({ _id }, { $set: data });
        const doc = await col.findOne({ _id });
        return send(res, 200, { ok: true, data: publicDoc(doc) });
      }
      const i = memory.cupones.findIndex(x => x.id === id);
      if (i < 0) return error(res, 404, 'Cupón no encontrado.');
      memory.cupones[i] = { ...memory.cupones[i], ...data };
      return send(res, 200, { ok: true, data: memory.cupones[i] });
    }
    if (req.method === 'DELETE') {
      if (!id) return error(res, 400, 'Falta id de cupón.');
      if (col) {
        const _id = oid(id);
        if (!_id) return error(res, 400, 'ID inválido.');
        await col.deleteOne({ _id });
        return send(res, 200, { ok: true });
      }
      memory.cupones = memory.cupones.filter(x => x.id !== id);
      return send(res, 200, { ok: true });
    }
    return error(res, 405, 'Método no permitido.');
  } catch (e) {
    return error(res, 500, e.message || 'Error en cupones.');
  }
};
