import express from 'express';
import reportsRoutes from './routes/reportsRoutes.js';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { getConfig } from './config.js';
import { securityHeaders, protectWrites } from './Middleware/security.js';
import { auditMiddleware } from './Middleware/logsMiddleware.js';
import auditRoutes from './routes/auditRoutes.js';
import userRoutes from './routes/userRoutes.js';
import devicesRoutes from './routes/devicesRoutes.js';
import transceiversRoutes from './routes/transceiversRoutes.js';
import wholesaleStockRoutes from './routes/wholesaleStockRoutes.js';
import additionalServicesRoutes from './routes/additionalServicesRoutes.js';
export function createApp({ auditSink } = {}) {
  const app = express();
  const config = getConfig();
  app.disable('x-powered-by');
  app.use(securityHeaders, auditMiddleware(auditSink));
  app.use(cors({ origin: config.origins, credentials: true }));
  app.use(protectWrites(config.origins));
  // Solo el contrato de carga necesita un cuerpo amplio porque el XLSX viaja
  // como Base64. El resto de la API conserva el límite pequeño por seguridad.
  app.use(cookieParser());
  app.use('/api/v1/stock', express.json({ limit: '14mb' }), wholesaleStockRoutes);
  app.use(express.json({ limit: '64kb' }));
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api/additional-services', additionalServicesRoutes);
  app.use('/api/v1/inventario', reportsRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/devices', devicesRoutes);
  app.use('/api', transceiversRoutes);
  app.use((req, res) => res.status(404).json({ message: 'Ruta no encontrada.' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    let status = error.status || 500;
    if (error.code === 11000) status = 409;
    if (['ValidationError', 'CastError'].includes(error.name)) status = 400;
    if (status >= 500) console.error(JSON.stringify({ event: 'server_error', type: error.name }));
    res.status(status).json({ message: status === 409 ? 'El registro ya existe.' : status === 400 ? 'Datos inválidos. Revisa los campos enviados.' : status === 413 ? 'La solicitud es demasiado grande.' : 'No se pudo procesar la solicitud. Inténtalo nuevamente.' });
  });
  return app;
}
