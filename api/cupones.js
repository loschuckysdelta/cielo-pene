const { setCors, send, error, readBody, normalizeText, toBool, toNumber } = require('./_lib/http');
const { collection, oid, publicDoc, publicList, memory, memoryId, ensureIndexes } = require('./_lib/db');

function clean(body, previous = {}) {
  const tipo = normalizeText(body.tipo) || previous.tipo || 'porcentaje';
  const modoUso = normalizeText(body.modoUso || body.uso || previous.modoUso) || 'ilimitado';
  const limiteRaw = toNumber(body.limiteUsos ?? body.maxUsos ?? previous.limiteUsos ?? 0, 0);
  const limiteUsos = modoUso === 'limitado' ? Math.max(1, Math.floor(limiteRaw)) : 0;
  const usosActuales = Math.max(0, Math.floor(toNumber(body.usos ?? body.usosActuales ?? previous.usos ?? previous.usosActuales ?? 0, 0)));
  return {
    codigo: normalizeText(body.codigo || previous.codigo).toUpperCase(),
    tipo: ['porcentaje', 'monto'].includes(tipo) ? tipo : 'porcentaje',
    valor: Math.max(0, toNumber(body.valor ?? previous.valor, 0)),
    modoUso: limiteUsos > 0 ? 'limitado' : 'ilimitado',
    limiteUsos,
    usos: usosActuales,
    activo: toBool(body.activo ?? previous.activo, true),
    descripcion: normalizeText(body.descripcion ?? previous.descripcion),
    vence: normalizeText(body.vence ?? previous.vence),
    updatedAt: new Date().toISOString()
  };
}

function enrich(c) {
  const copy = publicDoc(c);
  if (!copy) return copy;
  copy.usos = Number(copy.usos) || 0;
  copy.limiteUsos = Number(copy.limiteUsos) || 0;
  copy.modoUso = copy.limiteUsos > 0 ? 'limitado' : 'ilimitado';
  copy.restantes = copy.limiteUsos > 0 ? Math.max(0, copy.limiteUsos - copy.usos) : null;
  copy.agotado = copy.limiteUsos > 0 && copy.usos >= copy.limiteUsos;
  return copy;
}

function validForClient(c) {
  if (!c || c.activo === false) return false;
  if (c.vence && new Date(c.vence + 'T23:59:59') < new Date()) return false;
  if ((Number(c.limiteUsos) || 0) > 0 && (Number(c.usos) || 0) >= Number(c.limiteUsos)) return false;
  return true;
}

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  try {
    await ensureIndexes();
    const col = await collection('cupones');
    const id = req.query.id;

    if (req.method === 'GET') {
      const admin = req.query.admin === '1';
      const codigo = normalizeText(req.query.codigo).toUpperCase();
      if (col) {
        const filtro = codigo ? { codigo } : (admin ? {} : { activo: true });
        const docs = await col.find(filtro).sort({ codigo: 1 }).toArray();
        const data = docs.map(enrich).filter(c => admin || validForClient(c));
        return send(res, 200, { ok: true, data: codigo ? (data[0] || null) : data });
      }
      let docs = codigo ? memory.cupones.filter(c => c.codigo === codigo) : [...memory.cupones];
      docs = docs.map(enrich).filter(c => admin || validForClient(c));
      return send(res, 200, { ok: true, data: codigo ? (docs[0] || null) : docs });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const data = clean(body);
      if (!data.codigo) return error(res, 400, 'El cupón necesita código.');
      if (data.valor <= 0) return error(res, 400, 'El cupón necesita valor mayor a 0.');
      data.createdAt = new Date().toISOString();
      if (col) {
        const exists = await col.findOne({ codigo: data.codigo });
        if (exists) return error(res, 400, 'Ya existe un cupón con ese código.');
        const r = await col.insertOne(data);
        return send(res, 201, { ok: true, data: enrich({ ...data, _id: r.insertedId }) });
      }
      if (memory.cupones.some(c => c.codigo === data.codigo)) return error(res, 400, 'Ya existe un cupón con ese código.');
      const doc = { ...data, id: memoryId() };
      memory.cupones.push(doc);
      return send(res, 201, { ok: true, data: enrich(doc) });
    }

    if (req.method === 'PUT') {
      if (!id) return error(res, 400, 'Falta id de cupón.');
      const body = await readBody(req);
      if (col) {
        const _id = oid(id);
        if (!_id) return error(res, 400, 'ID inválido.');
        const prev = await col.findOne({ _id });
        if (!prev) return error(res, 404, 'Cupón no encontrado.');
        const data = clean(body, prev);
        if (!data.codigo) return error(res, 400, 'El cupón necesita código.');
        const duplicado = await col.findOne({ codigo: data.codigo, _id: { $ne: _id } });
        if (duplicado) return error(res, 400, 'Ya existe otro cupón con ese código.');
        await col.updateOne({ _id }, { $set: data });
        const doc = await col.findOne({ _id });
        return send(res, 200, { ok: true, data: enrich(doc) });
      }
      const i = memory.cupones.findIndex(x => x.id === id);
      if (i < 0) return error(res, 404, 'Cupón no encontrado.');
      const data = clean(body, memory.cupones[i]);
      const duplicado = memory.cupones.find(x => x.id !== id && x.codigo === data.codigo);
      if (duplicado) return error(res, 400, 'Ya existe otro cupón con ese código.');
      memory.cupones[i] = { ...memory.cupones[i], ...data };
      return send(res, 200, { ok: true, data: enrich(memory.cupones[i]) });
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
