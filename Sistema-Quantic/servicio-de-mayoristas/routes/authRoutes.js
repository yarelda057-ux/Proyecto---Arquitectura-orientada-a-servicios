import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import User from '../models/user.js';
import Session from '../models/session.js';
import Supplier from '../models/supplier.js';
import validateAuth, { requireAdmin } from '../Middleware/authMiddleware.js';
import { loginLimiter } from '../Middleware/security.js';
import { config } from '../config.js';
import { companyByRuc, assertCompany } from '../services/companyRegistry.js';
const router = Router();
const dummy = await bcrypt.hash(randomUUID(), 12);
router.post('/login', loginLimiter(), async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || Buffer.byteLength(password) > 72) return res.status(400).json({ message: 'Credenciales inválidas.' });
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');
  const matches = await bcrypt.compare(password, user?.password || dummy);
  if (!user || !matches || user.isActive === false || (user.role === 'mayorista' && !await Supplier.exists({ supplierId: user.supplierId, activo: true }))) return res.status(401).json({ message: 'Correo o contraseña incorrectos.' });
  const jti = randomUUID(), exp = Math.floor(Date.now() / 1000) + 3600;
  if (user.role === 'mayorista') {
    const supplier = await Supplier.findOne({ supplierId: user.supplierId, activo: true });
    assertCompany(await companyByRuc(supplier?.ruc));
  }
  await Session.create({ _id: jti, userId: user._id, expiresAt: new Date(exp * 1000) });
  const access_token = jwt.sign({ exp }, config().secret, { algorithm: 'HS256', subject: String(user._id), jwtid: jti, issuer: 'wholesale-stock', audience: 'wholesale-api' });
  res.json({ access_token, token_type: 'Bearer', expires_in: 3600 });
});
router.get('/profile', validateAuth, (req, res) => res.json({ _id: String(req.user._id), email: req.user.email, role: req.user.role, supplierId: req.user.supplierId, company: req.user.company ? { id: req.user.company.id, ruc: req.user.company.ruc, nombre: req.user.company.razon_social, ofreceServicios: Boolean(req.user.company.ofrece_servicios), proveeEquipos: Boolean(req.user.company.provee_equipos) } : null, exp: req.session.exp }));
router.post('/logout', validateAuth, async (req, res) => {
  if (req.session.jti) await Session.deleteOne({ _id: req.session.jti });
  res.json({ message: 'Sesión cerrada.' });
});
router.get('/users', validateAuth, requireAdmin, async (req, res) => {
  const ids = typeof req.query.ids === 'string' ? req.query.ids.split(',') : [];
  if (!ids.length || ids.length > 100 || ids.some(id => !/^[a-f0-9]{24}$/i.test(id))) return res.status(400).json({ message: 'Identificadores inválidos.' });
  res.json({ users: await User.find({ _id: { $in: ids } }).select('_id email role').lean() });
});
export default router;
