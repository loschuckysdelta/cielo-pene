function parseCookies(req) {
  const raw = String(req?.headers?.cookie || '');
  const out = {};
  raw.split(';').forEach(part => {
    const index = part.indexOf('=');
    if (index < 0) return;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) return;
    try { out[key] = decodeURIComponent(value); } catch (_) { out[key] = value; }
  });
  return out;
}

function isHttps(req) {
  const forwarded = String(req?.headers?.['x-forwarded-proto'] || '').toLowerCase();
  return forwarded === 'https' || Boolean(process.env.VERCEL);
}

function appendSetCookie(res, value) {
  const current = res.getHeader('Set-Cookie');
  if (!current) return res.setHeader('Set-Cookie', value);
  const list = Array.isArray(current) ? current : [current];
  res.setHeader('Set-Cookie', [...list, value]);
}

function setHttpOnlyCookie(req, res, name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(String(value || ''))}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (isHttps(req)) parts.push('Secure');
  if (Number.isFinite(options.maxAge)) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  appendSetCookie(res, parts.join('; '));
}

function clearCookie(req, res, name) {
  setHttpOnlyCookie(req, res, name, '', { maxAge: 0 });
}

module.exports = { parseCookies, setHttpOnlyCookie, clearCookie };
