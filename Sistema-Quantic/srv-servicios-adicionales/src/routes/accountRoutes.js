const router = require('express').Router();
const { authenticate, admin, asyncRoute } = require('../companySecurity');
const accounts = require('../localAccounts');
const Empresa = require('../models/empresaModel');
const attempts = new Map();
router.post('/login', asyncRoute(async (req, res) => {
  const now = Date.now(), key = req.ip;
  for (const [ip, entry] of attempts) if (entry.until < now) attempts.delete(ip);
  const item = attempts.get(key) || { count: 0, until: now + 60000 };
  if (++item.count > 10 || attempts.size > 10000) return res.status(429).json({ mensaje: 'Demasiados intentos. Espera un minuto.' });
  attempts.set(key, item);
  res.set('Cache-Control', 'no-store').json(await accounts.login(req.body.email, req.body.password));
}));
router.post('/logout', authenticate, (req, res) => {
  accounts.logout(req.get('authorization')?.replace(/^Bearer /, ''));
  res.json({ mensaje: 'Sesion cerrada.' });
});
router.post('/empresas/:id', authenticate, admin, asyncRoute(async (req, res) => {
  const company = await Empresa.getById(req.params.id);
  if (!company) return res.status(404).json({ mensaje: 'Empresa no encontrada.' });
  await accounts.save(company.id, req.body.email, req.body.password);
  res.json({ mensaje: 'Acceso guardado en Servicios adicionales. Las sesiones anteriores se cerraron.' });
}));
module.exports = router;
