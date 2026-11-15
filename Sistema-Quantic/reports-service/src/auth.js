import { createHmac, timingSafeEqual } from 'node:crypto';
import { fail } from './domain.js';
export function authenticate(header, clients, scope) {
  try {
    const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(header || '');
    if (!match) throw fail(401, 'Credenciales inválidas.');
    const [head, body, signature] = match[1].split('.');
    const h = JSON.parse(Buffer.from(head, 'base64url'));
    const claims = JSON.parse(Buffer.from(body, 'base64url'));
    const client = Object.hasOwn(clients, claims.iss) ? clients[claims.iss] : null;
    if (!client || h.alg !== 'HS256' || h.crit || claims.aud !== 'reports-api' || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128) throw fail(401, 'Credenciales inválidas.');
    const expected = createHmac('sha256', client.secret).update(head + '.' + body).digest();
    const supplied = Buffer.from(signature, 'base64url');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw fail(401, 'Credenciales inválidas.');
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(claims.exp) || !Number.isInteger(claims.iat) || claims.exp <= now || claims.iat > now + 5 || now - claims.iat > 60 || claims.exp - claims.iat > 60 || (claims.nbf !== undefined && (!Number.isInteger(claims.nbf) || claims.nbf > now))) throw fail(401, 'Credenciales vencidas o inválidas.');
    if (!Array.isArray(claims.scopes) || !claims.scopes.includes(scope) || !client.scopes.includes(scope)) throw fail(403, 'Permisos insuficientes.');
    return { clientId: claims.iss, actorId: claims.sub };
  } catch (err) { throw err.status ? err : fail(401, 'Credenciales inválidas.'); }
}
