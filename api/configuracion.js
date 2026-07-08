const { setCors, send, error, readBody, normalizeText, toBool, toNumber } = require('./_lib/http');
const { collection, publicDoc, memory } = require('./_lib/db');

const DEFAULT_CONFIG = {
  negocio: 'Antoja2',
  slogan: 'Postres bajo un cielo rosado',
  whatsapp: '51992855508',
  direccion: 'Trujillo, Perú',
  maps: '',
  instagram: '',
  facebook: '',
  tiktok: '',
  horario: 'Lunes a sábado de 9am a 8pm',
  deliveryActivo: true,
  recojoActivo: true,
  moneda: 'S/',
  colorPrincipal: '#c23d73'
};

function clean(body) {
  return {
    negocio: normalizeText(body.negocio) || DEFAULT_CONFIG.negocio,
    slogan: normalizeText(body.slogan),
    whatsapp: normalizeText(body.whatsapp) || DEFAULT_CONFIG.whatsapp,
    direccion: normalizeText(body.direccion),
    maps: normalizeText(body.maps),
    instagram: normalizeText(body.instagram),
    facebook: normalizeText(body.facebook),
    tiktok: normalizeText(body.tiktok),
    horario: normalizeText(body.horario),
    deliveryActivo: toBool(body.deliveryActivo, true),
    recojoActivo: toBool(body.recojoActivo, true),
    moneda: normalizeText(body.moneda) || 'S/',
    colorPrincipal: normalizeText(body.colorPrincipal) || '#c23d73',
    updatedAt: new Date().toISOString()
  };
}

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  try {
    const col = await collection('configuracion');
    if (req.method === 'GET') {
      if (col) {
        let doc = await col.findOne({ clave: 'main' });
        if (!doc) {
          await col.insertOne({ clave: 'main', ...DEFAULT_CONFIG, createdAt: new Date().toISOString() });
          doc = await col.findOne({ clave: 'main' });
        }
        return send(res, 200, { ok: true, data: publicDoc(doc) });
      }
      if (!memory.configuracion) memory.configuracion = { ...DEFAULT_CONFIG, id: 'main' };
      return send(res, 200, { ok: true, data: memory.configuracion });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const body = await readBody(req);
      const data = clean(body);
      if (col) {
        await col.updateOne({ clave: 'main' }, { $set: data, $setOnInsert: { clave: 'main', createdAt: new Date().toISOString() } }, { upsert: true });
        const doc = await col.findOne({ clave: 'main' });
        return send(res, 200, { ok: true, data: publicDoc(doc) });
      }
      memory.configuracion = { ...data, id: 'main' };
      return send(res, 200, { ok: true, data: memory.configuracion });
    }
    return error(res, 405, 'Método no permitido.');
  } catch (e) {
    return error(res, 500, e.message || 'Error en configuración.');
  }
};
