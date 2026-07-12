const { setCors, send, error, readBody, normalizeText } = require('./_lib/http');
const { collection, memory } = require('./_lib/db');

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== 'DELETE' && req.method !== 'POST') return error(res, 405, 'Método no permitido.');
  try {
    const body = await readBody(req);
    if (normalizeText(body.confirmacion) !== 'BORRAR') return error(res, 400, 'Para borrar debes enviar confirmacion: BORRAR.');
    const target = normalizeText(body.target);
    const permitidos = ['productos','pedidos','categorias','delivery','cupones','resenas'];
    if (!permitidos.includes(target)) return error(res, 400, 'Target inválido.');
    const col = await collection(target);
    if (col) await col.deleteMany({});
    else memory[target] = [];
    return send(res, 200, { ok: true, mensaje: `${target} borrado.` });
  } catch (e) {
    return error(res, 500, e.message || 'Error limpiando datos.');
  }
};
