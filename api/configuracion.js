const { setCors, send, error, readBody, normalizeText, toBool, toNumber } = require('./_lib/http');
const { collection, publicDoc, memory, hasMongo } = require('./_lib/db');
const cloud = require('./_lib/cloudinary');

const DEFAULT_CONFIG = {
  negocio: 'Cielo Postres',
  slogan: 'Cada postre cuenta una historia',
  whatsapp: '51992855508',
  direccion: 'Perú',
  maps: '',
  instagram: '',
  facebook: '',
  tiktok: '',
  youtube: '',
  telegram: '',
  twitter: '',
  threads: '',
  web: '',
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
    youtube: normalizeText(body.youtube),
    telegram: normalizeText(body.telegram),
    twitter: normalizeText(body.twitter),
    threads: normalizeText(body.threads),
    web: normalizeText(body.web),
    horario: normalizeText(body.horario),
    deliveryActivo: toBool(body.deliveryActivo, true),
    recojoActivo: toBool(body.recojoActivo, true),
    moneda: normalizeText(body.moneda) || 'S/',
    colorPrincipal: normalizeText(body.colorPrincipal) || '#c23d73',
    updatedAt: new Date().toISOString()
  };
}


function actionFrom(req) {
  if (req.query && req.query.action) return normalizeText(req.query.action).toLowerCase();
  try {
    const url = new URL(req.url || '', 'http://localhost');
    return normalizeText(url.searchParams.get('action')).toLowerCase();
  } catch (_) {
    return '';
  }
}

async function handleStatus(req, res) {
  if (req.method !== 'GET') return error(res, 405, 'Método no permitido.');
  let mongoOk = false;
  let mongoError = null;
  if (hasMongo()) {
    try {
      const col = await collection('productos');
      await col.findOne({}, { projection: { _id: 1 } });
      mongoOk = true;
    } catch (e) {
      mongoError = e.message;
    }
  }
  return send(res, 200, {
    ok: true,
    mongoConfigurado: hasMongo(),
    mongoConectado: mongoOk,
    mongoError,
    cloudinaryConfigurado: cloud.configured(),
    modo: mongoOk ? 'mongo' : 'memoria_temporal',
    mensaje: mongoOk
      ? 'Conectado a MongoDB.'
      : 'No hay conexión MongoDB. El panel funciona en memoria temporal y no persiste cambios.'
  });
}

async function handleLimpiar(req, res) {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return error(res, 405, 'Método no permitido.');
  }
  const body = await readBody(req);
  if (normalizeText(body.confirmacion) !== 'BORRAR') {
    return error(res, 400, 'Para borrar debes enviar confirmacion: BORRAR.');
  }
  const target = normalizeText(body.target);
  const permitidos = ['productos', 'pedidos', 'categorias', 'delivery', 'cupones', 'resenas'];
  if (!permitidos.includes(target)) return error(res, 400, 'Target inválido.');
  const col = await collection(target);
  if (col) await col.deleteMany({});
  else memory[target] = [];
  return send(res, 200, { ok: true, mensaje: `${target} borrado.` });
}

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  try {
    const action = actionFrom(req);
    if (action === 'status') return await handleStatus(req, res);
    if (action === 'limpiar') return await handleLimpiar(req, res);

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
