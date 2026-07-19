const path = require('path');
const { setCors, send, error } = require('./_lib/http');

const ALLOWED_ENDPOINTS = new Set([
  'auth',
  'categorias',
  'clientes-auth',
  'clientes',
  'comprobantes-pago',
  'configuracion',
  'cupones',
  'delivery',
  'health',
  'imagenes-menu',
  'metodos-pago',
  'notificaciones',
  'pedidos',
  'productos',
  'redes',
  'resenas',
  'usuarios'
]);

function getEndpoint(req) {
  const fromQuery = req && req.query && req.query.endpoint;
  if (typeof fromQuery === 'string' && fromQuery) return fromQuery;

  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  const parts = pathname.split('/').filter(Boolean);
  return parts[1] || '';
}

module.exports = async function apiRouter(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const endpoint = getEndpoint(req);
  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    return send(res, 404, {
      ok: false,
      error: 'API no encontrada',
      endpoint
    });
  }

  try {
    const handlerPath = path.join(__dirname, '_handlers', `${endpoint}.js`);
    const handler = require(handlerPath);
    if (typeof handler !== 'function') {
      throw new TypeError(`El controlador ${endpoint} no exporta una función`);
    }
    return await handler(req, res);
  } catch (err) {
    console.error(`[api/${endpoint}]`, err);
    if (res.headersSent) return;
    return error(res, err, 500);
  }
};
