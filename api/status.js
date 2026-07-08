const { setCors, send } = require('./_lib/http');
const { hasMongo, collection } = require('./_lib/db');
const cloud = require('./_lib/cloudinary');

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
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
  send(res, 200, {
    ok: true,
    mongoConfigurado: hasMongo(),
    mongoConectado: mongoOk,
    mongoError,
    cloudinaryConfigurado: cloud.configured(),
    modo: mongoOk ? 'mongo' : 'memoria_temporal',
    mensaje: mongoOk ? 'Conectado a MongoDB.' : 'No hay conexión MongoDB. El panel funciona en memoria temporal y no persiste cambios.'
  });
};
