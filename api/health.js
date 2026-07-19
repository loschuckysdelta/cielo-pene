const { setCors, send, error } = require('./_lib/http');
const { hasMongo, db } = require('./_lib/db');
const cloudinary = require('./_lib/cloudinary');

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== 'GET') return error(res, 405, 'Método no permitido.');

  const status = {
    ok: true,
    app: 'Cielo Postres',
    node: process.version,
    mongodb: { configured: hasMongo(), connected: false },
    cloudinary: { configured: cloudinary.configured() },
    timestamp: new Date().toISOString()
  };

  if (hasMongo()) {
    try {
      const database = await db();
      await database.command({ ping: 1 });
      status.mongodb.connected = true;
    } catch (err) {
      status.ok = false;
      status.mongodb.error = err.message;
    }
  }

  return send(res, status.ok ? 200 : 503, status);
};
