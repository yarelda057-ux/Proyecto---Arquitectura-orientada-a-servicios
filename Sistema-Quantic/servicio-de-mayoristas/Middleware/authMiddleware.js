import jwt from 'jsonwebtoken';
import User from '../models/user.js';
import Session from '../models/session.js';
import { config } from '../config.js';
export default async function validateAuth(req, res, next) {
  const token = req.get('authorization')?.replace(/^Bearer /, '');
  let claims;
  try {
    const c = config();
    try {
      claims = jwt.verify(token, c.secret, { algorithms: ['HS256'], issuer: 'wholesale-stock', audience: 'wholesale-api' });
    } catch (err) {
      if (!c.integrationKey) throw err;
      claims = jwt.verify(token, c.integrationKey, { algorithms: ['HS256'], issuer: 'inventory-gateway', audience: 'wholesale-api', maxAge: '60s' });
                                                                                     
      if (!['admin', 'user'].includes(claims.role) || !/^[a-f0-9]{24}$/i.test(claims.sub)) throw err;
      req.user = { _id: claims.sub, role: claims.role, email: claims.email };
      req.session = claims;
      return next();
    }
    if (!claims.sub || !claims.jti) throw new Error('Invalid token');
  } catch { return res.status(401).json({ message: 'Sesión inválida o vencida.' }); }
  try {
    const session = await Session.findOne({ _id: claims.jti, userId: claims.sub, expiresAt: { $gt: new Date() } });
    const user = session && await User.findById(claims.sub).select('-password');
    if (!user || user.isActive === false) return res.status(401).json({ message: 'Sesión inválida.' });
    req.user = user; req.session = claims; next();
  } catch (err) { next(err); }
}
export function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Se requieren permisos de administrador.' });
  next();
}
