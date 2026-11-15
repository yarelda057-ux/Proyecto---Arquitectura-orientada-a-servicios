import jwt from 'jsonwebtoken';
export const wholesaleCookie = () => process.env.NODE_ENV === 'production' ? '__Host-wholesale_token' : 'wholesale_token';
export async function wholesaleRequest(path, { method = 'GET', token, body, idempotencyKey, viaEsb = false, correlationId } = {}) {
  const url = new URL(viaEsb ? (process.env.INTEGRATION_ESB_URL || 'http://127.0.0.1:8003') : (process.env.WHOLESALE_SERVICE_URL || 'http://127.0.0.1:3001'));
  if (url.username || url.password || (url.protocol !== 'https:' && !(['localhost', '127.0.0.1'].includes(url.hostname) && process.env.NODE_ENV !== 'production'))) throw new Error('URL de mayoristas inválida.');
  try {
    if (viaEsb && (process.env.INTEGRATION_ESB_KEY || '').length < 32) throw new Error('Falta configurar el ESB.');
    return await fetch(new URL(viaEsb ? path.replace(/^\/api\/v1\/stock/, '/v1/stock') : path, url), { method, redirect: 'error', signal: AbortSignal.timeout(viaEsb ? 6000 : 30000),
      headers: { ...(viaEsb ? { 'X-ESB-Key': process.env.INTEGRATION_ESB_KEY } : {}), ...(correlationId ? { 'X-Correlation-ID': correlationId } : {}), ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  } catch { const err = new Error('El servicio de mayoristas no está disponible.'); err.status = 503; throw err; }
}
export function delegationToken(user) {
  const key = process.env.WHOLESALE_INTEGRATION_KEY;
  if (!key || key.length < 32) throw new Error('Falta WHOLESALE_INTEGRATION_KEY.');
  return jwt.sign({ role: user.role, email: user.email }, key, { algorithm: 'HS256', subject: String(user._id), issuer: 'inventory-gateway', audience: 'wholesale-api', expiresIn: 60 });
}
