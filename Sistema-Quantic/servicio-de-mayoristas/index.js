import mongoose from 'mongoose';
import { config } from './config.js';
import { createApp } from './app.js';
import { startNotificationOutboxWorker } from './services/notificationOutboxWorker.js';
const c = config();
await mongoose.connect(c.uri);
await Promise.all(Object.values(mongoose.models).map(model => model.init()));
const stopNotifications = startNotificationOutboxWorker({ intervalMs: Number(process.env.NOTIFICATION_OUTBOX_INTERVAL_MS || 5000) });
const server = createApp().listen(c.port, () => console.log('Servicio de Gestión de Stock de Mayoristas listo en puerto ' + c.port));
async function stop() {
  const timer = setTimeout(() => process.exit(1), 10000); timer.unref();
  stopNotifications();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect(); clearTimeout(timer);
}
process.on('SIGINT', stop); process.on('SIGTERM', stop);
