import mongoose from 'mongoose';
import Device from './models/devices.js';
import Sfp from './models/sfp.js';
import Session from './models/session.js';
import AuditOutbox from './models/auditOutbox.js';
import AnalyticsJob from './models/analyticsJob.js';
import { startAnalyticsWorker } from './services/analyticsDelivery.js';
import { auditConfig } from './services/auditClient.js';
import { startAuditWorker } from './services/auditDelivery.js';
import { createApp } from './app.js';
import connectDB from './db/dbConection.js';
auditConfig();
const app = createApp();
await connectDB();
await Promise.all([Device.init(), Sfp.init(), Session.init(), AuditOutbox.init(), AnalyticsJob.init()]);
const stopWorker = startAuditWorker();
const stopAnalytics = startAnalyticsWorker();
const server = app.listen(Number(process.env.PORT || 3000), () => console.log('API de inventario lista.'));
let stopping = false;
async function shutdown() {
  if (stopping) return; stopping = true;
  const deadline = setTimeout(() => process.exit(1), 15000); deadline.unref();
  await new Promise(resolve => server.close(resolve));
  await stopWorker();
  await stopAnalytics();
  await mongoose.disconnect();
  clearTimeout(deadline);
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
