const router = require('express').Router();
const Empresa = require('../models/empresaModel');
const db = require('../config/db');
const { authenticate, admin, asyncRoute } = require('../companySecurity');
const { capabilities, updateActivities, wholesale } = require('../companyRegistry');
router.use(authenticate);
router.get('/empresas/ruc/:ruc', asyncRoute(async (req, res) => {
  if (!['admin', 'integration'].includes(req.identity.role)) return res.status(403).json({ mensaje: 'Acceso denegado.' });
  // Stock permissions must never be granted from volatile demonstration data.
  if (!db.isMySQLConnected()) return res.status(503).json({ mensaje: 'El registro de empresas requiere MySQL.' });
  if (!/^\d{11}$/.test(req.params.ruc)) return res.status(400).json({ mensaje: 'RUC invalido.' });
  const company = await Empresa.getByRuc(req.params.ruc);
  if (!company) return res.status(404).json({ mensaje: 'Registra o vincula primero la empresa en Servicios adicionales.' });
  res.set('Cache-Control', 'no-store').json({ empresa: company });
}));
router.patch('/empresas/:id/actividades', admin, asyncRoute(async (req, res) => {
  res.json({ datos: await updateActivities(req.params.id, capabilities(req.body)), mensaje: 'Actividades actualizadas.' });
}));
router.post('/empresas/:id/vincular', admin, asyncRoute(async (req, res) => {
  const company = await Empresa.getById(req.params.id);
  if (!company || company.estado_verificacion !== 'APROBADO') return res.status(409).json({ mensaje: 'Aprueba primero la empresa.' });
  const result = await wholesale('/empresas/' + company.ruc + '/vincular', req.identity, { method: 'POST', body: { idMayorista: req.body.idMayorista } });
  res.json({ mensaje: result.message });
}));
router.post('/empresas/:id/acceso', admin, asyncRoute(async (req, res) => {
  const company = await Empresa.getById(req.params.id);
  if (!company || company.estado_verificacion !== 'APROBADO') return res.status(409).json({ mensaje: 'Aprueba primero la empresa.' });
  const { email, password, accion } = req.body || {};
  if (!['crear', 'password'].includes(accion) || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== 'string' || [...password].length < 15 || Buffer.byteLength(password) > 72) return res.status(400).json({ mensaje: 'Indica correo y contrasena de al menos 15 caracteres (maximo 72 bytes).' });
  const result = await wholesale('/empresas/' + company.ruc + '/acceso', req.identity, { method: 'POST', body: { email, password, accion } });
  res.json({ mensaje: result.message, datos: result.proveedor });
}));
router.post('/importar-proveedores', admin, asyncRoute(async (req, res) => {
  if (!db.isMySQLConnected()) return res.status(503).json({ mensaje: 'Se requiere MySQL para vincular empresas.' });
  const { proveedores } = await wholesale('/proveedores', req.identity);
  const resultado = { creadas: 0, existentes: 0, pendientes: [] };
  const counts = new Map();
  for (const p of proveedores) counts.set(p.ruc, (counts.get(p.ruc) || 0) + 1);
  for (const p of proveedores) {
    if (!/^\d{11}$/.test(p.ruc || '') || counts.get(p.ruc) > 1) { resultado.pendientes.push({ idMayorista: p.idMayorista, motivo: 'Falta RUC o esta repetido; requiere revision.' }); continue; }
    if (await Empresa.getByRuc(p.ruc)) { resultado.existentes++; continue; }
    await Empresa.create({ razon_social: p.nombre, ruc: p.ruc, email_contacto: p.correoContacto, telefono: 'Pendiente de completar', ciudad: 'Pendiente', descripcion: 'Proveedor existente importado para revision.', ofrece_servicios: false, provee_equipos: true });
    resultado.creadas++;
  }
  res.json({ mensaje: 'Proveedores importados como solicitudes pendientes; revisa y aprueba sus actividades. Se conservaron los IDs y el historial de stock.', datos: resultado });
}));
module.exports = router;
