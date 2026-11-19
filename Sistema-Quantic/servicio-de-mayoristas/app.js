import { createApiDocs } from './apiDocs.cjs';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { securityHeaders } from './Middleware/security.js';
import authRoutes from './routes/authRoutes.js';
import stockRoutes from './routes/wholesaleStockRoutes.js';
const apiDocs = createApiDocs({ specPath: new URL('./openapi.json', import.meta.url), title: 'Gestión de Stock de Mayoristas' });
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(cors({ origin: (process.env.CLIENT_ORIGINS || '').split(',').filter(Boolean) }));
  app.use((req, res, next) => { if (!apiDocs(req, res)) next(); });
  app.get('/health/live', (req, res) => res.json({ status: 'ok' }));
  app.get('/health/ready', (req, res) => res.status(mongoose.connection.readyState === 1 ? 200 : 503).json({ ready: mongoose.connection.readyState === 1 }));
  app.use('/api/v1/auth', express.json({ limit: '16kb' }), authRoutes);
  app.use('/api/v1/stock', express.json({ limit: '14mb' }), stockRoutes);
  app.use((req, res) => res.status(404).json({ message: 'Ruta no encontrada.' }));
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.code === 11000 ? 409 : ['ValidationError', 'CastError'].includes(err.name) ? 400 : err.status || 500;
    res.status(status).json({ message: status >= 500 ? 'Servicio no disponible.' : status === 409 ? 'El registro o acceso ya existe.' : err.message });
  });
  return app;
}
