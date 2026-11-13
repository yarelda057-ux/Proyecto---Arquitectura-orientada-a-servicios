process.env.AUDIT_ENABLED = 'false';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import User from '../models/user.js';
import Device from '../models/devices.js';
import Sfp from '../models/sfp.js';
import Session from '../models/session.js';
const dbName = `quantic_test_${randomBytes(8).toString('hex')}`;
process.env.JWT_SECRET = randomBytes(48).toString('base64');
process.env.CLIENT_ORIGINS = 'http://localhost:5173';
process.env.NODE_ENV = 'test';
let server;
try {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/inventario', { dbName, serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.init(), Device.init(), Sfp.init(), Session.init()]);
  await User.create({ email: 'integration@example.test', password: 'test-only password phrase', role: 'admin' });
  server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let cookie = '';
  const request = (path, method = 'GET', body) => fetch(base + path, { method, headers: { Origin: 'http://localhost:5173', 'X-Requested-With': 'QuanticWeb', 'Content-Type': 'application/json', Cookie: cookie }, ...(method !== 'GET' ? { body: JSON.stringify(body || {}) } : {}) });
  const response = await request('/users/login', 'POST', { email: 'integration@example.test', password: 'test-only password phrase' });
  assert.equal(response.status, 200); cookie = response.headers.get('set-cookie').split(';')[0];
  for (const [all, add, edit, remove] of [['/devices/allDevices', '/devices/addDevices', '/devices/editDevice', '/devices/deleteDevice'], ['/allTransceivers', '/addTransceivers', '/editTransceiver', '/deleteTransceiver']]) {
    const product = { p_n: 'TEST-PART', descripcion: 'Producto de prueba', marca: 'Test', state: 'New', p_a: 'Almacén', s_n: ['A'], cantidad: 1 };
    const created = await request(add, 'POST', product); assert.equal(created.status, 201); const { data } = await created.json();
    assert.equal((await request(all)).status, 200);
    assert.equal((await request(add, 'POST', product)).status, 409);
    const edited = await request(`${edit}/${data._id}`, 'PATCH', { s_n: ['A', 'B'], cantidad: 2 });
    assert.equal(edited.status, 200); assert.equal((await edited.json()).data.cantidad, 2);
    assert.equal((await request(`${edit}/${data._id}`, 'PATCH', { $set: { cantidad: 900 } })).status, 400);
    assert.equal((await request(`${remove}/${data._id}`, 'DELETE')).status, 200);
    assert.equal((await request(`${remove}/${data._id}`, 'DELETE')).status, 404);
  }
  const registered = await request('/users/register', 'POST', { email: 'new@example.test', password: 'another long test password', role: 'admin' });
  assert.equal(registered.status, 201); assert.equal((await User.findOne({ email: 'new@example.test' })).role, 'user');
  assert.equal((await request('/users/logout', 'POST')).status, 200);
  assert.equal((await request('/users/profile')).status, 401);
  assert.equal(await Session.countDocuments(), 0);
  console.log('PASS: MongoDB real, login, CRUD equipos/SFP, duplicados, registro y revocación.');
} finally {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  // Eliminar únicamente la base temporal creada por esta ejecución.
  if (mongoose.connection.name === dbName && dbName.startsWith('quantic_test_')) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}
