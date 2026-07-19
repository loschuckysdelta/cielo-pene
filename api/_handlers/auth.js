const { setCors, send, error, readBody } = require('../_lib/http');
const {
  ensureBootstrapUser, findUserByEmail, verifyPassword, signToken,
  publicUser, effectivePermissions, updateLastAccess, currentUser, ADMIN_COOKIE
} = require('../_lib/auth');
const { setHttpOnlyCookie, clearCookie } = require('../_lib/cookies');

const ADMIN_COOKIE_AGE = 60 * 60 * 24 * 7;

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  try {
    await ensureBootstrapUser();

    if (req.method === 'POST') {
      const body = await readBody(req);
      if (String(body.accion || body.action || '').toLowerCase() === 'logout') {
        clearCookie(req, res, ADMIN_COOKIE);
        return send(res, 200, { ok: true });
      }
      const user = await findUserByEmail(body.email);
      if (!user || user.activo === false || !verifyPassword(body.password, user.passwordHash)) {
        return error(res, 401, 'Correo o contraseña incorrectos.');
      }
      const lastAccess = await updateLastAccess(user);
      user.lastAccess = lastAccess;
      const token = signToken(user);
      setHttpOnlyCookie(req, res, ADMIN_COOKIE, token, { maxAge: ADMIN_COOKIE_AGE });
      return send(res, 200, {
        ok: true,
        data: { user: { ...publicUser(user), permissions: effectivePermissions(user) }, sessionSaved: true }
      });
    }

    if (req.method === 'GET') {
      const user = await currentUser(req);
      if (!user) return error(res, 401, 'Sesión vencida o no autorizada.');
      setHttpOnlyCookie(req, res, ADMIN_COOKIE, signToken(user), { maxAge: ADMIN_COOKIE_AGE });
      return send(res, 200, {
        ok: true,
        data: { ...publicUser(user), permissions: effectivePermissions(user) }
      });
    }

    return error(res, 405, 'Método no permitido.');
  } catch (e) {
    return error(res, 500, e.message || 'Error de autenticación.');
  }
};
