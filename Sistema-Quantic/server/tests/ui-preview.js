process.env.AUDIT_ENABLED = 'false';
// Servidor temporal de revisión visual; nunca usa la base de inventario.
import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import User from '../models/user.js';
import Device from '../models/devices.js';
import Sfp from '../models/sfp.js';
import Session from '../models/session.js';
const dbName = `quantic_ui_test_${randomBytes(8).toString('hex')}`;
process.env.JWT_SECRET = randomBytes(48).toString('base64');
process.env.NODE_ENV = 'test';
process.env.CLIENT_ORIGINS = 'http://localhost:5173';
process.env.SESSION_TTL_SECONDS = '120';
await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/inventario', { dbName });
await Promise.all([User.init(), Device.init(), Sfp.init(), Session.init()]);
await User.create({ email: 'preview@example.test', password: 'Visual test account 2026', role: 'user' });
await Device.create({ p_n: 'C9200L-24T-4G', descripcion: 'Switch de acceso · 24 puertos Gigabit', marca: 'Cisco', state: 'New', p_a: 'Almacén', s_n: ['QA-SW-001', 'QA-SW-002'], cantidad: 2 });
await Sfp.create({ p_n: 'SFP-10G-SR', descripcion: 'Transceptor óptico · 10 Gb/s · 850 nm', marca: 'Cisco', state: 'New', p_a: 'Producción', s_n: ['QA-SFP-001'], cantidad: 1 });
const server = createApp().listen(3000, '127.0.0.1', () => console.log('Vista de prueba lista en 3000. Cuenta de prueba: preview@example.test / Visual test account 2026. Escribir stop para limpiar.'));
let stopping = false;
async function stop() {
  if (stopping) return; stopping = true;
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  if (mongoose.connection.name === dbName && dbName.startsWith('quantic_ui_test_')) await mongoose.connection.dropDatabase();
  await mongoose.disconnect(); process.exit(0);
}
process.on('SIGINT', stop); process.on('SIGTERM', stop);
process.stdin.on('data', data => { if (data.toString().includes('stop')) stop(); });
setTimeout(stop, 15 * 60 * 1000);
