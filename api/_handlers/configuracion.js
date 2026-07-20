const { setCors, send, error, readBody, normalizeText, toBool, toNumber } = require('../_lib/http');
const { collection, publicDoc, memory, hasMongo } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');
const cloud = require('../_lib/cloudinary');

const DEFAULT_CONFIG = {
  negocio: 'Cielo Postres',
  logoBoleta: 'https://i.postimg.cc/3JzmtRgP/image.png',
  tituloBoleta: 'BOLETA ELECTRÓNICA DE COMPRA',
  rucBoleta: '',
  telefonoBoleta: '',
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
  colorPrincipal: '#c23d73',
  metaVentasMonto: 15000,
  metaVentasDias: 30,
  metaVentasInicio: '',
  reporteCadaDias: 7,
  recordatorioReportesActivo: true,
  ultimoReporteAt: ''
};

function clampInteger(value, def, min, max) {
  return Math.max(min, Math.min(max, Math.floor(toNumber(value, def))));
}

function clean(body = {}, current = {}) {
  const source = { ...DEFAULT_CONFIG, ...(current || {}), ...(body || {}) };
  return {
    negocio: normalizeText(source.negocio) || DEFAULT_CONFIG.negocio,
    logoBoleta: normalizeText(source.logoBoleta) || DEFAULT_CONFIG.logoBoleta,
    tituloBoleta: normalizeText(source.tituloBoleta) || DEFAULT_CONFIG.tituloBoleta,
    rucBoleta: normalizeText(source.rucBoleta),
    telefonoBoleta: normalizeText(source.telefonoBoleta || source.whatsapp),
    slogan: normalizeText(source.slogan),
    whatsapp: normalizeText(source.whatsapp) || DEFAULT_CONFIG.whatsapp,
    direccion: normalizeText(source.direccion),
    maps: normalizeText(source.maps),
    instagram: normalizeText(source.instagram),
    facebook: normalizeText(source.facebook),
    tiktok: normalizeText(source.tiktok),
    youtube: normalizeText(source.youtube),
    telegram: normalizeText(source.telegram),
    twitter: normalizeText(source.twitter),
    threads: normalizeText(source.threads),
    web: normalizeText(source.web),
    horario: normalizeText(source.horario),
    deliveryActivo: toBool(source.deliveryActivo, true),
    recojoActivo: toBool(source.recojoActivo, true),
    moneda: normalizeText(source.moneda) || 'S/',
    colorPrincipal: normalizeText(source.colorPrincipal) || '#c23d73',
    metaVentasMonto: Math.max(1, toNumber(source.metaVentasMonto, DEFAULT_CONFIG.metaVentasMonto)),
    metaVentasDias: clampInteger(source.metaVentasDias, DEFAULT_CONFIG.metaVentasDias, 1, 3650),
    metaVentasInicio: normalizeText(source.metaVentasInicio),
    reporteCadaDias: clampInteger(source.reporteCadaDias, DEFAULT_CONFIG.reporteCadaDias, 1, 365),
    recordatorioReportesActivo: toBool(source.recordatorioReportesActivo, true),
    ultimoReporteAt: normalizeText(source.ultimoReporteAt),
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

async function currentConfig() {
  const col = await collection('configuracion');
  if (col) {
    const doc = await col.findOne({ clave: 'main' });
    return { col, data: { ...DEFAULT_CONFIG, ...(doc ? publicDoc(doc) : {}) } };
  }
  if (!memory.configuracion) memory.configuracion = { ...DEFAULT_CONFIG, id: 'main' };
  return { col: null, data: { ...DEFAULT_CONFIG, ...memory.configuracion } };
}

async function saveConfig(data) {
  const col = await collection('configuracion');
  if (col) {
    await col.updateOne(
      { clave: 'main' },
      { $set: data, $setOnInsert: { clave: 'main', createdAt: new Date().toISOString() } },
      { upsert: true }
    );
    return publicDoc(await col.findOne({ clave: 'main' }));
  }
  memory.configuracion = { ...data, id: 'main' };
  return memory.configuracion;
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

async function clearCollection(name) {
  const col = await collection(name);
  if (col) {
    const result = await col.deleteMany({});
    return result.deletedCount || 0;
  }
  const count = Array.isArray(memory[name]) ? memory[name].length : 0;
  memory[name] = [];
  return count;
}

async function clearUsersExceptPrincipal() {
  const col = await collection('usuarios');
  if (col) {
    const result = await col.deleteMany({ role: { $ne: 'principal' } });
    return result.deletedCount || 0;
  }
  const before = (memory.usuarios || []).length;
  memory.usuarios = (memory.usuarios || []).filter(user => user.role === 'principal');
  return before - memory.usuarios.length;
}

async function handleLimpiar(req, res) {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return error(res, 405, 'Método no permitido.');
  }
  const auth = await requireAuth(req, res, 'herramientas');
  if (!auth) return;

  const body = await readBody(req);
  const target = normalizeText(body.target).toLowerCase();
  const confirmacion = normalizeText(body.confirmacion).toUpperCase();
  const permitidos = [
    'productos', 'pedidos', 'categorias', 'delivery', 'cupones', 'resenas',
    'clientes', 'notificaciones', 'pushsubscriptions', 'usuarios', 'todo'
  ];
  if (!permitidos.includes(target)) return error(res, 400, 'Target inválido.');
  if (['usuarios', 'todo'].includes(target) && auth.user.role !== 'principal') {
    return error(res, 403, 'Solo el administrador principal puede borrar usuarios o todos los datos.');
  }
  if (target === 'todo' && confirmacion !== 'BORRAR TODO') {
    return error(res, 400, 'Para borrar todo debes escribir BORRAR TODO.');
  }
  if (target !== 'todo' && confirmacion !== 'BORRAR') {
    return error(res, 400, 'Para borrar debes escribir BORRAR.');
  }

  if (target === 'usuarios') {
    const deleted = await clearUsersExceptPrincipal();
    return send(res, 200, { ok: true, mensaje: 'Administradores y gestores eliminados. El administrador principal se conservó.', deleted });
  }

  if (target === 'todo') {
    const targets = ['productos', 'pedidos', 'categorias', 'delivery', 'cupones', 'resenas', 'clientes', 'notificaciones', 'pushSubscriptions'];
    const deleted = {};
    for (const name of targets) deleted[name] = await clearCollection(name);
    deleted.usuarios = await clearUsersExceptPrincipal();
    return send(res, 200, {
      ok: true,
      mensaje: 'Se borraron los datos operativos. Se conservaron la configuración y el administrador principal.',
      deleted
    });
  }

  const collectionName = target === 'pushsubscriptions' ? 'pushSubscriptions' : target;
  const deleted = await clearCollection(collectionName);
  return send(res, 200, { ok: true, mensaje: `${target} borrado.`, deleted });
}

async function handleReportSettings(req, res) {
  if (req.method !== 'PUT' && req.method !== 'POST') return error(res, 405, 'Método no permitido.');
  const auth = await requireAuth(req, res, 'reportes');
  if (!auth) return;
  const body = await readBody(req);
  const { data: previous } = await currentConfig();
  const partial = {
    metaVentasMonto: body.metaVentasMonto !== undefined ? body.metaVentasMonto : previous.metaVentasMonto,
    metaVentasDias: body.metaVentasDias !== undefined ? body.metaVentasDias : previous.metaVentasDias,
    metaVentasInicio: body.metaVentasInicio !== undefined ? body.metaVentasInicio : previous.metaVentasInicio,
    reporteCadaDias: body.reporteCadaDias !== undefined ? body.reporteCadaDias : previous.reporteCadaDias,
    recordatorioReportesActivo: body.recordatorioReportesActivo !== undefined ? body.recordatorioReportesActivo : previous.recordatorioReportesActivo,
    ultimoReporteAt: body.ultimoReporteAt !== undefined ? body.ultimoReporteAt : previous.ultimoReporteAt
  };
  const saved = await saveConfig(clean(partial, previous));
  return send(res, 200, { ok: true, data: saved });
}

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  try {
    const action = actionFrom(req);
    if (action === 'status') return await handleStatus(req, res);
    if (action === 'limpiar') return await handleLimpiar(req, res);
    if (action === 'reportes') return await handleReportSettings(req, res);

    const { col, data: existing } = await currentConfig();
    if (req.method === 'GET') {
      if (col && !existing.createdAt) {
        await col.updateOne({ clave: 'main' }, { $setOnInsert: { clave: 'main', createdAt: new Date().toISOString() } }, { upsert: true });
      }
      return send(res, 200, { ok: true, data: existing });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const auth = await requireAuth(req, res, 'configuracion');
      if (!auth) return;
      const body = await readBody(req);
      const saved = await saveConfig(clean(body, existing));
      return send(res, 200, { ok: true, data: saved });
    }
    return error(res, 405, 'Método no permitido.');
  } catch (e) {
    return error(res, 500, e.message || 'Error en configuración.');
  }
};
