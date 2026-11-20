import { wholesaleCookie, wholesaleRequest } from '../services/wholesaleClient.js';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import validateAuth, { requireAdmin, verifyToken } from '../Middleware/authMiddleware.js';
import { loginLimiter } from '../Middleware/security.js';
import { getConfig, cookieOptions, cookieName } from '../config.js';
import User from '../models/user.js';
import Session from '../models/session.js';
const router = Router();
const dummyHash = await bcrypt.hash(randomUUID(), 12);
const profile = (user, exp) => ({ email: user.email, role: user.role, idMayorista: user.supplierId || null, expiresAt: exp * 1000, serverTime: Date.now() });
router.post('/login', loginLimiter(), async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || !password || Buffer.byteLength(password) > 72) return res.status(400).json({ message: 'Ingresa un correo y una contraseña válidos.' });
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');
  if (!user || user.role === 'mayorista') {
    const response = await wholesaleRequest('/api/v1/auth/login', { method: 'POST', body: { email, password } });
    if (!response.ok) return res.status(response.status).json({ message: response.status === 401 ? 'Correo o contraseña incorrectos.' : 'No se pudo iniciar sesión.' });
    const data = await response.json();
    const identityResponse = await wholesaleRequest('/api/v1/auth/profile', { token: data.access_token });
    if (!identityResponse.ok) return res.status(503).json({ message: 'No se pudo comprobar la sesión.' });
    const identity = await identityResponse.json();
    res.clearCookie(cookieName(), cookieOptions());
    res.cookie(wholesaleCookie(), data.access_token, { ...cookieOptions(), maxAge: data.expires_in * 1000 });
    req.user = identity;
    return res.json(profile(identity, identity.exp));
  }
  const matches = await bcrypt.compare(password, user?.password || dummyHash);
  if (!user || !matches || user.isActive === false) return res.status(401).json({ message: 'Correo o contraseña incorrectos.' });
  const config = getConfig();
  const jti = randomUUID();
  const exp = Math.floor(Date.now() / 1000) + config.sessionSeconds;
  await Session.create({ _id: jti, userId: user._id, expiresAt: new Date(exp * 1000) });
  let old;
  try { old = verifyToken(req.cookies?.[cookieName()]); } catch {                                  }
  if (old) await Session.deleteOne({ _id: old.jti });
  const token = jwt.sign({ exp }, config.secret, { algorithm: 'HS256', subject: String(user._id), jwtid: jti, issuer: config.issuer, audience: config.audience });
  res.clearCookie(wholesaleCookie(), cookieOptions());
  res.cookie(cookieName(), token, { ...cookieOptions(), maxAge: config.sessionSeconds * 1000 });
  req.user = user;
  res.json(profile(user, exp));
});
                                                                       
router.post('/register', validateAuth, requireAdmin, async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== 'string' || [...password].length < 15 || Buffer.byteLength(password) > 72) return res.status(400).json({ message: 'Correo válido y contraseña de al menos 15 caracteres (máximo 72 bytes) requeridos.' });
  await User.create({ email: email.trim().toLowerCase(), password, role: 'user' });
  res.status(201).json({ message: 'Usuario registrado.' });
});
router.post('/logout', async (req, res) => {
  if (req.cookies?.[wholesaleCookie()]) {
    const response = await wholesaleRequest('/api/v1/auth/logout', { method: 'POST', token: req.cookies[wholesaleCookie()], body: {} });
    if (!response.ok && response.status !== 401) return res.status(503).json({ message: 'No se pudo cerrar la sesión.' });
    res.clearCookie(wholesaleCookie(), cookieOptions());
  }
  let claims;
  try { claims = verifyToken(req.cookies?.[cookieName()]); } catch {                           }
  if (claims) {
    const result = await Session.deleteOne({ _id: claims.jti });
    if (result.deletedCount) req.auditActorId = claims.sub;
  }
  res.clearCookie(cookieName(), cookieOptions());
  res.json({ message: 'Sesión cerrada.' });
});
router.get('/profile', validateAuth, (req, res) => res.json(profile(req.user, req.session.exp)));
export default router;
