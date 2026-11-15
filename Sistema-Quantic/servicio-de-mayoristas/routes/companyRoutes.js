import { Router } from 'express';
import Supplier from '../models/supplier.js';
import User from '../models/user.js';
import Session from '../models/session.js';
import validateAuth, { requireAdmin } from '../Middleware/authMiddleware.js';
import { companyByRuc, assertCompany } from '../services/companyRegistry.js';
const router = Router();
router.use(validateAuth, requireAdmin);
router.post('/:ruc/vincular', async (req, res) => {
  const company = assertCompany(await companyByRuc(req.params.ruc));
  const id = req.body?.idMayorista;
  if (typeof id !== 'string' || !/^MAY-[A-Z0-9-]{4,58}$/.test(id)) return res.status(400).json({ message: 'Identificador de proveedor invalido.' });
  const supplier = await Supplier.findOne({ supplierId: id });
  if (!supplier) return res.status(404).json({ message: 'Proveedor no encontrado.' });
  if ((supplier.ruc && supplier.ruc !== company.ruc) || await Supplier.exists({ ruc: company.ruc, supplierId: { $ne: id } })) return res.status(409).json({ message: 'El RUC ya esta vinculado o no corresponde al proveedor. No se modificaron los registros.' });
  supplier.ruc = company.ruc; supplier.companyRuc = company.ruc;
  supplier.nombre = company.razon_social; supplier.correoContacto = company.email_contacto;
  await supplier.save();
  res.json({ message: 'Empresa vinculada; se conservaron las cuentas, el ID y el historial de stock.' });
});
router.post('/:ruc/acceso', async (req, res) => {
  const { email: rawEmail, password, accion } = req.body || {};
  if (!['crear', 'password'].includes(accion) || typeof rawEmail !== 'string' || rawEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) || typeof password !== 'string' || [...password].length < 15 || Buffer.byteLength(password) > 72) return res.status(400).json({ message: 'Correo o contrasena invalidos.' });
  const company = assertCompany(await companyByRuc(req.params.ruc));
  const email = rawEmail.trim().toLowerCase();
  const matches = await Supplier.find({ ruc: company.ruc }).limit(2);
  if (matches.length > 1) return res.status(409).json({ message: 'Hay proveedores con RUC duplicado; revisa los registros antes de vincular.' });
  let supplier = matches[0];
  if (!supplier) {
    supplier = await Supplier.findOneAndUpdate({ companyRuc: company.ruc }, { $setOnInsert: { supplierId: 'MAY-' + company.ruc, ruc: company.ruc, companyRuc: company.ruc, nombre: company.razon_social, correoContacto: company.email_contacto, activo: true, notificationsEnabled: false, notificationSyncStatus: 'synced' } }, { new: true, upsert: true, runValidators: true });
  } else {
    supplier.companyRuc = company.ruc;
    supplier.nombre = company.razon_social;
    supplier.correoContacto = company.email_contacto;
    supplier.activo = true;
    await supplier.save();
  }
  const prior = await User.findOne({ supplierId: supplier.supplierId, role: 'mayorista' }).select('+password');
  if (accion === 'password') {
    if (!prior || prior.email !== email) return res.status(404).json({ message: 'No existe esa cuenta vinculada a esta empresa.' });
    prior.password = password; prior.isActive = true; await prior.save();
    await Session.deleteMany({ userId: prior._id });
  } else {
    if (prior || await User.exists({ email })) return res.status(409).json({ message: 'La empresa o el correo ya tiene acceso.' });
    await User.create({ email, password, role: 'mayorista', supplierId: supplier.supplierId });
  }
  res.json({ message: accion === 'crear' ? 'Acceso creado. Ingresa desde el login del inventario.' : 'Contrasena actualizada y sesiones anteriores cerradas.', proveedor: { idMayorista: supplier.supplierId, ruc: company.ruc } });
});
export default router;
