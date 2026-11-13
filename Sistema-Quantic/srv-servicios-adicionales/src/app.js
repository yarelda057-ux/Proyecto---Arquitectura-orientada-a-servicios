// =============================================================================
// CONFIGURACIÓN PRINCIPAL DE LA APLICACIÓN EXPRESS
// Microservicio: SRV-G5202605 - Quantic Technology S.A.C.
// =============================================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./config/db');

const empresasRoutes = require('./routes/empresasRoutes');
const serviciosRoutes = require('./routes/serviciosRoutes');
const adminDemoRoutes = require('./routes/adminDemoRoutes');

const app = express();

// Middlewares globales
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
  console.error('[Error de Aplicación]:', err);
  res.status(500).json({
    status: 'error',
    codigo: 500,
    mensaje: 'Ha ocurrido un error inesperado en el servidor.'
  });
});

module.exports = app;
