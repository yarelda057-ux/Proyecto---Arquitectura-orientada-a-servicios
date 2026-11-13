import 'dotenv/config';
export function getConfig() {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error('JWT_SECRET debe contener al menos 32 bytes aleatorios.');
  const sessionSeconds = Number(process.env.SESSION_TTL_SECONDS || 3600);
  if (!Number.isInteger(sessionSeconds) || sessionSeconds < 60 || sessionSeconds > 86400) throw new Error('SESSION_TTL_SECONDS debe estar entre 60 y 86400.');
  const origins = (process.env.CLIENT_ORIGINS || 'http://localhost:5173').split(',').map(value => value.trim());
  if (origins.some(value => { try { return new URL(value).origin !== value || (process.env.NODE_ENV === 'production' && !value.startsWith('https://')); } catch { return true; } })) throw new Error('CLIENT_ORIGINS requiere orígenes exactos; HTTPS en producción.');
  return { secret, sessionSeconds, origins, issuer: 'quantic-inventory', audience: 'quantic-web' };
}
export const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' });

export const cookieName = () => process.env.NODE_ENV === 'production' ? '__Host-auth_token' : 'auth_token';
