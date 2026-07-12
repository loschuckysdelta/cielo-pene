const { setCors, send, error, readBody } = require('./_lib/http');
const {
  ensureBootstrapUser, findUserByEmail, verifyPassword, signToken,
  publicUser, effectivePermissions, updateLastAccess, currentUser
} = require('./_lib/auth');

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  try {
    await ensureBootstrapUser();

    if (req.method === 'POST') {
      const body = await readBody(req);
      const user = await findUserByEmail(body.email);
      if (!user || user.activo === false || !verifyPassword(body.password, user.passwordHash)) {
        return error(res, 401, 'Correo o contraseña incorrectos.');
      }
      const lastAccess = await updateLastAccess(user);
      user.lastAccess = lastAccess;
      return send(res, 200, {
        ok: true,
        data: {
          token: signToken(user),
          user: { ...publicUser(user), permissions: effectivePermissions(user) }
        }
      });
    }

    if (req.method === 'GET') {
      const user = await currentUser(req);
      if (!user) return error(res, 401, 'Sesión vencida o no autorizada.');
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
