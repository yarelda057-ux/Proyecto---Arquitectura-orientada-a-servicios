import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import User from '../models/user.js';
import Device from '../models/devices.js';
import Session from '../models/session.js';
import AuditOutbox from '../models/auditOutbox.js';
import { deliverBatch } from '../services/auditDelivery.js';
import { sendAuditEvent } from '../services/auditClient.js';
const root = fileURLToPath(new URL('../../', import.meta.url));
const id = randomBytes(8).toString('hex');
const inventoryDb = `audit_inventory_test_${id}`, auditDb = `audit_service_test_${id}`;
const key = () => randomBytes(48).toString('base64url');
const writeKey = key(), readKey = key();
const digest = value => createHash('sha256').update(value).digest('hex');
await mkdir(path.join(root, 'tmp'), { recursive: true });
const temp = await mkdtemp(path.join(root, 'tmp', 'audit-e2e-'));
const credentialsFile = path.join(temp, 'clients.json');
await writeFile(credentialsFile, JSON.stringify([
  { id: 'test-writer', source: 'inventory-test', key_sha256: digest(writeKey), scopes: ['events:write'] },
  { id: 'test-reader', source: 'inventory-test', key_sha256: digest(readKey), scopes: ['events:read'] },
]));
const portProbe = net.createServer().listen(0, '127.0.0.1');
await once(portProbe, 'listening');
const port = portProbe.address().port;
await new Promise(resolve => portProbe.close(resolve));
const python = process.env.AUDIT_PYTHON || path.join(root, 'audit-service', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const child = spawn(python, ['-m', 'uvicorn', 'app.main:create_app', '--factory', '--host', '127.0.0.1', '--port', String(port), '--no-access-log'], {
  cwd: path.join(root, 'audit-service'), windowsHide: true, stdio: 'ignore', env: { ...process.env, AUDIT_DB_NAME: auditDb, AUDIT_CLIENTS_FILE: credentialsFile, AUDIT_RETENTION_DAYS: '0', AUDIT_MONGODB_URI: 'mongodb://127.0.0.1:27017' },
});
let childError;
child.on('error', error => { childError = error; });
const closed = new Promise(resolve => child.once('close', resolve));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(check) {
  for (let i = 0; i < 80; i++) { if (childError) throw childError; if (await check()) return; await sleep(100); }
  throw new Error('Tiempo de espera agotado en integración de auditoría');
}
let server;
try {
  await eventually(async () => { try { return (await fetch(`http://127.0.0.1:${port}/health/ready`)).ok; } catch { return false; } });
  Object.assign(process.env, { AUDIT_ENABLED: 'true', AUDIT_SERVICE_URL: `http://127.0.0.1:${port}`, AUDIT_WRITE_KEY: writeKey, AUDIT_READ_KEY: readKey, JWT_SECRET: key(), CLIENT_ORIGINS: 'http://localhost:5173', NODE_ENV: 'test' });
  await mongoose.connect('mongodb://127.0.0.1:27017', { dbName: inventoryDb });
  await Promise.all([User.init(), Device.init(), Session.init(), AuditOutbox.init()]);
  const user = await User.create({ email: 'audit-admin@example.test', password: 'Test audit password phrase', role: 'admin' });
  server = createApp().listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let cookie = '';
  const request = (route, method = 'GET', body) => fetch(base + route, { method, headers: { Origin: 'http://localhost:5173', 'X-Requested-With': 'QuanticWeb', 'Content-Type': 'application/json', Cookie: cookie }, ...(method !== 'GET' ? { body: JSON.stringify(body || {}) } : {}) });
  let response = await request('/users/login', 'POST', { email: user.email, password: 'Test audit password phrase' });
  assert.equal(response.status, 200); cookie = response.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/devices/allDevices?password=do-not-record')).status, 200);
  await eventually(async () => await AuditOutbox.countDocuments() === 2);
  const first = await AuditOutbox.findOne({ 'event.path': '/api/users/login' }).lean();
                                                                                        
  await deliverBatch({ limit: 1, send: async () => { throw new Error('Simulated outage'); } });
  assert.equal(await AuditOutbox.countDocuments(), 2);
  assert.equal(await AuditOutbox.countDocuments({ attempts: 1 }), 1);
  await AuditOutbox.updateMany({}, { $set: { nextAttemptAt: new Date(0) } });
  await deliverBatch();
  assert.equal(await AuditOutbox.countDocuments(), 0);
                                                                
  const duplicate = await sendAuditEvent(first.event); assert.equal(duplicate.status, 200);
  response = await request('/audit/events'); assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.items.length, 2);
  assert.ok(result.items.every(event => event.actor_id === String(user._id)));
  assert.ok(!JSON.stringify(result).includes('do-not-record'));
  assert.ok(!JSON.stringify(result).includes('Test audit password'));
  assert.equal((await request('/audit/delivery')).status, 200);
  assert.equal((await request('/users/logout', 'POST')).status, 200);
  await eventually(async () => Boolean(await AuditOutbox.exists({ 'event.path': '/api/users/logout' })));
  await deliverBatch();
  const auditCollection = mongoose.connection.getClient().db(auditDb).collection('events');
  const logout = await auditCollection.findOne({ path: '/api/users/logout' });
  assert.equal(logout.actor_id, String(user._id));
  assert.equal((await request('/audit/events')).status, 401);
  console.log('PASS: Express → outbox MongoDB → Python → MongoDB → consulta de administrador; reintento, idempotencia y logout verificados.');
} finally {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  child.kill(); await closed;
  if (mongoose.connection.readyState === 1 && mongoose.connection.name === inventoryDb) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.getClient().db(auditDb).dropDatabase();
  }
  await mongoose.disconnect();
  await unlink(credentialsFile); await rmdir(temp);
}
