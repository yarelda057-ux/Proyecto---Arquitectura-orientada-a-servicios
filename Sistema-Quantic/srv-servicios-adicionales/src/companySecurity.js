const { createHmac, timingSafeEqual } = require('node:crypto');

function sign(claims, key) {
  if (!key || key.length < 32) throw new Error('Falta la clave de integracion de empresas.');
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const data = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ ...claims, iat: now, exp: now + 60 });
  return data + '.' + createHmac('sha256', key).update(data).digest('base64url');
}
function verify(token, key, now = Math.floor(Date.now() / 1000)) {
  if (!key || key.length < 32 || typeof token !== 'string' || token.length > 4096) throw new Error('Invalid token');
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) throw new Error('Invalid token');
  const expected = createHmac('sha256', key).update(parts[0] + '.' + parts[1]).digest();
  const received = Buffer.from(parts[2], 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error('Invalid signature');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
  const c = JSON.parse(Buffer.from(parts[1], 'base64url'));
  if (header.alg !== 'HS256' || header.typ !== 'JWT' || c.aud !== 'company-api' || !Number.isInteger(c.iat) || !Number.isInteger(c.exp) || c.exp <= now || c.iat > now + 5 || c.exp - c.iat > 60 || c.exp <= c.iat || typeof c.sub !== 'string' || !c.sub) throw new Error('Invalid claims');
  if (c.iss === 'inventory-gateway' && ['admin', 'user'].includes(c.role)) return c;
  throw new Error('Invalid issuer');
}
function authenticate(req, res, next) {
  try {
    const local = require('./localAccounts').session(req.get('authorization')?.replace(/^Bearer /, ''));
    req.identity = local || verify(req.get('authorization')?.replace(/^Bearer /, ''), process.env.COMPANY_INTEGRATION_KEY);
    next();
  } catch { res.status(401).json({ mensaje: 'Inicia sesion con tu cuenta de Servicios adicionales.' }); }
}
function admin(req, res, next) {
  if (req.identity?.role !== 'admin') return res.status(403).json({ mensaje: 'Se requieren permisos de administrador.' });
  next();
}
async function companyAccess(req, company, { services = false } = {}) {
  if (!company) throw Object.assign(new Error('Empresa no encontrada.'), { status: 404 });
  if (req.identity?.role !== 'admin' && (req.identity?.role !== 'empresa' || String(req.identity.companyId) !== String(company.id))) throw Object.assign(new Error('No tienes acceso a esta empresa.'), { status: 403 });
  if (services && (!Boolean(company.ofrece_servicios) || company.estado_verificacion !== 'APROBADO')) throw Object.assign(new Error('La empresa no esta habilitada para publicar servicios.'), { status: 403 });
  return company;
}
function asyncRoute(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
module.exports = { sign, verify, authenticate, admin, companyAccess, asyncRoute };
