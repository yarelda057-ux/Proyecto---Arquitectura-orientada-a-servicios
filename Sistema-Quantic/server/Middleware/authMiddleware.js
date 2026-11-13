import { wholesaleCookie, wholesaleRequest } from '../services/wholesaleClient.js';
import jwt from 'jsonwebtoken';
import Session from '../models/session.js';
import User from '../models/user.js';
import { getConfig, cookieOptions, cookieName } from '../config.js';
export function verifyToken(token) {
  const config = getConfig();
  const claims = jwt.verify(token, config.secret, { algorithms: ['HS256'], issuer: config.issuer, audience: config.audience });
  if (!claims.jti || !claims.sub || !Number.isInteger(claims.exp)) throw new Error('Invalid claims');
  return claims;
}
export default async function validateAuth(req, res, next) {
  const remoteToken = req.cookies?.[wholesaleCookie()];
  if (remoteToken) {
    try {
      const response = await wholesaleRequest('/api/v1/auth/profile', { token: remoteToken });
      if (!response.ok) { res.clearCookie(wholesaleCookie(), cookieOptions()); return res.status(response.status).json({ message: 'Inicia sesión nuevamente.' }); }
      const profile = await response.json();
      req.user = profile; req.session = { exp: profile.exp };
      return next();
    } catch (error) { return next(error); }
  }
  let claims;
  try { claims = verifyToken(req.cookies?.[cookieName()]); }
  catch { res.clearCookie(cookieName(), cookieOptions()); return res.status(401).json({ message: 'La sesión terminó. Inicia sesión nuevamente.' }); }
  try {
    const session = await Session.findOne({ _id: claims.jti, userId: claims.sub, expiresAt: { $gt: new Date() } });
    const user = session && await User.findById(claims.sub).select('-password');
    if (!user || user.isActive === false) {
      res.clearCookie(cookieName(), cookieOptions());
      return res.status(401).json({ message: 'La sesión terminó. Inicia sesión nuevamente.' });
    }
    req.user = user;
    req.session = claims;
    next();
  } catch (error) { next(error); }
}
export function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Se requieren permisos de administrador.' });
  next();
}
