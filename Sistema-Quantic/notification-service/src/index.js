import express from 'express';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import mongoose from 'mongoose';
import soap from 'soap';
import { config } from './config.js';
import SupplierSchedule from './models/supplierSchedule.js';
import { createScheduleOperations } from './services/scheduleService.js';
import { sendCatalogReminder } from './services/mailer.js';
import { startReminderWorker } from './services/reminderWorker.js';

const app = express();
app.disable('x-powered-by');
app.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
app.get('/health/ready', (_req, res) => res.status(mongoose.connection.readyState === 1 ? 200 : 503).json({ status: mongoose.connection.readyState === 1 ? 'ready' : 'unavailable' }));
app.use('/soap/notifications', express.raw({ type: () => true, limit: '32kb' }));

const httpServer = http.createServer(app);
await mongoose.connect(config.mongoUri, { dbName: config.mongoDb, serverSelectionTimeoutMS: 5000 });
await SupplierSchedule.init();

const wsdlPath = new URL('../contract/notifications.wsdl', import.meta.url);
const wsdl = (await readFile(wsdlPath, 'utf8')).replaceAll('http://127.0.0.1:8002', config.publicUrl);
const operations = createScheduleOperations();
const services = {
  NotificationService: {
    NotificationPort: {
      RegisterSupplierSchedule: operations.RegisterSupplierSchedule,
      ReportCatalogUpdate: operations.ReportCatalogUpdate,
      CancelSupplierSchedule: operations.CancelSupplierSchedule,
      GetSupplierSchedule: operations.GetSupplierSchedule,
    },
  },
};

const soapServer = soap.listen(httpServer, '/soap/notifications', services, wsdl, () => {
  console.info(`Contrato WSDL disponible en ${config.publicUrl}/soap/notifications?wsdl`);
});
soapServer.authorizeConnection = (req, res) => {
  if (req.method === 'GET') return true;
  const supplied = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const actual = Buffer.from(supplied);
  for (const [consumer, key] of Object.entries(config.soapClientKeys)) {
    const expected = Buffer.from(key);
    if (actual.length === expected.length && timingSafeEqual(actual, expected)) {
      req.consumerSystem = consumer;
      return true;
    }
  }
  res.statusCode = 401;
  return false;
};

const stopWorker = startReminderWorker({
  intervalMs: config.workerIntervalMs,
  sendReminder: sendCatalogReminder,
});

httpServer.listen(config.port, config.host, () => {
  console.info(`Servicio de notificaciones escuchando en ${config.host}:${config.port}`);
});

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  stopWorker();
  await new Promise(resolve => httpServer.close(resolve));
  await mongoose.disconnect();
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
