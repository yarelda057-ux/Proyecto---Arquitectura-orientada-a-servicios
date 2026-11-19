// =============================================================================
// CONFIGURACIÓN PRINCIPAL DE LA APLICACIÓN EXPRESS
// Microservicio: SRV-G5202605 - Quantic Technology S.A.C.
// =============================================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./config/db');
const { authenticate, admin, companyAccess, asyncRoute } = require('./companySecurity');
const Empresa = require('./models/empresaModel');
const Servicio = require('./models/servicioModel');

const empresasRoutes = require('./routes/empresasRoutes');
const serviciosRoutes = require('./routes/serviciosRoutes');
const adminDemoRoutes = require('./routes/adminDemoRoutes');

const app = express();
const { createApiDocs } = require('../apiDocs.cjs');
const apiDocs = createApiDocs({ specPath: path.join(__dirname, '../openapi.json'), title: 'Consulta de Servicios Adicionales' });
app.use((req, res, next) => { if (!apiDocs(req, res)) next(); });

// Middlewares globales
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.get('/js/company-config.js', (_req, res) => {
  const origins = (process.env.PORTAL_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(x => x.trim()).filter(Boolean);
  res.type('js').send('window.COMPANY_PORTAL_ORIGINS=' + JSON.stringify(origins) + ';');
});
app.use('/api/v1', (req, res, next) => {
  if (!['GET', 'HEAD'].includes(req.method) && !db.isMySQLConnected()) return res.status(503).json({ mensaje: 'No se pueden guardar cambios temporalmente. Intenta mas tarde.' });
  next();
});
app.use('/api/v1/cuentas', require('./routes/accountRoutes'));
app.get('/api/v1/mi-empresa', authenticate, asyncRoute(async (req, res) => {
  if (req.identity.role !== 'empresa') return res.json({ datos: null, role: req.identity.role });
  res.json({ datos: await companyAccess(req, await Empresa.getById(req.identity.companyId)), role: req.identity.role });
}));
app.get('/api/v1/catalogo/empresas/perfil/ruc/:ruc', authenticate, asyncRoute(async (req, _res, next) => {
  await companyAccess(req, await Empresa.getByRuc(req.params.ruc)); next();
}));
app.put('/api/v1/catalogo/empresas/:id', authenticate, asyncRoute(async (req, _res, next) => {
  await companyAccess(req, await Empresa.getById(req.params.id)); next();
}));
app.post('/api/v1/catalogo/servicios', authenticate, asyncRoute(async (req, _res, next) => {
  await companyAccess(req, await Empresa.getById(req.body.empresa_id), { services: true }); next();
}));
app.put('/api/v1/catalogo/servicios/:id', authenticate, asyncRoute(async (req, _res, next) => {
  const service = await Servicio.getById(req.params.id);
  await companyAccess(req, service && await Empresa.getById(service.empresa_id), { services: true }); next();
}));
app.patch('/api/v1/catalogo/servicios/:id/estado', authenticate, asyncRoute(async (req, res) => {
  const service = await Servicio.getById(req.params.id);
  await companyAccess(req, service && await Empresa.getById(service.empresa_id), { services: true });
  if (!['INACTIVO', 'PENDIENTE'].includes(req.body?.estado)) return res.status(400).json({ mensaje: 'Solo puedes pausar la oferta o enviarla a revision.' });
  const updated = await Servicio.updateEstado(service.id, req.body.estado);
  res.json({ datos: updated, mensaje: req.body.estado === 'PENDIENTE' ? 'Oferta enviada a revision del administrador.' : 'Oferta pausada.' });
}));
app.use('/api/v1/demo-admin', authenticate, admin);

// Servir frontend estático (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, '../public')));

// Endpoint de diagnóstico y salud del microservicio
app.get('/api/v1/salud', (req, res) => {
  res.status(200).json({
    servicio: 'Servicio de Consulta de Servicios Adicionales',
    identificador: 'SRV-G5202605',
    proveedor: 'Quantic Technology S.A.C.',
    dominio: 'Comercial',
    estado: 'ACTIVO',
    base_de_datos: {
      motor: 'MySQL',
      estado: db.isMySQLConnected() ? 'CONECTADO' : 'MODO_DEMO_MEMORIA',
      detalle: db.isMySQLConnected() 
        ? 'Persistencia activa en base de datos MySQL' 
        : 'Ejecutando en memoria local (Configure MySQL en .env cuando esté listo)'
    },
    marca_tiempo: new Date().toISOString()
  });
});

// Rutas de la API REST del Catálogo
app.use('/api/v1/catalogo/empresas', empresasRoutes);
app.use('/api/v1/catalogo/servicios', serviciosRoutes);

// Rutas de Demostración Administrativa (Aprobación/Rechazo)
app.use('/api/v1/demo-admin', adminDemoRoutes);

// Manejo de rutas API no encontradas (404)
app.use('/api/*', (req, res) => {
  res.status(404).json({
    status: 'error',
    codigo: 404,
    mensaje: `La ruta de API solicitada '${req.originalUrl}' no existe en el catálogo de Quantic Technology.`
  });
});

// Redirigir cualquier otra petición a la interfaz web principal
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Manejador global de errores no controlados
app.use((err, req, res, next) => {
  if (err.status && err.status < 500) return res.status(err.status).json({ mensaje: err.message });
  console.error('[Error de Aplicación]:', err);
  res.status(500).json({
    status: 'error',
    codigo: 500,
    mensaje: 'Ha ocurrido un error inesperado en el servidor.'
  });
});

module.exports = app;
