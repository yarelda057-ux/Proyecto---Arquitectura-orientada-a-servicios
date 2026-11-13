import { createServer } from 'node:http';
process.env.AUDIT_ENABLED = 'false';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { createApp } from '../app.js';
import User from '../models/user.js';
import Session from '../models/session.js';
import Device from '../models/devices.js';
import { validateInventory } from '../routes/inventoryRoutes.js';
import { verifyToken } from '../Middleware/authMiddleware.js';
import { getConfig } from '../config.js';
import { loginLimiter } from '../Middleware/security.js';
process.env.JWT_SECRET = randomBytes(48).toString('base64');
process.env.CLIENT_ORIGINS = 'http://localhost:5173';
process.env.NODE_ENV = 'test';
const sessions = new Map();
const user = { _id: '507f1f77bcf86cd799439011', email: 'operator@example.test', role: 'user', isActive: true, password: await bcrypt.hash('example password for testing', 12) };
let server, base, cookie, wholesaleStub;
const headers = { origin: 'http://localhost:5173', 'X-Requested-With': 'QuanticWeb', 'Content-Type': 'application/json' };
const product = { p_n: 'SFP-10G', descripcion: 'Módulo óptico', marca: 'Cisco', state: 'New', p_a: 'Almacén', s_n: ['A1'], cantidad: 1 };
async function request(path, options = {}) {
  return fetch(base + path, { ...options, headers: { ...headers, ...(cookie ? { cookie } : {}), ...options.headers } });
}
before(async () => {
  wholesaleStub = createServer((req, res) => { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ message: 'Correo o contraseña incorrectos.' })); }).listen(0, '127.0.0.1');
  await new Promise(resolve => wholesaleStub.once('listening', resolve));
  process.env.WHOLESALE_SERVICE_URL = 'http://127.0.0.1:' + wholesaleStub.address().port;

  User.findOne = query => ({ select: async () => query.email === user.email ? user : null });
  User.findById = () => ({ select: async () => user });
  Session.create = async data => { sessions.set(data._id, data); return data; };
  Session.findOne = async query => { const session = sessions.get(query._id); return session && session.expiresAt > query.expiresAt.$gt ? session : null; };
  Session.deleteOne = async query => sessions.delete(query._id);
  Device.find = () => ({ sort: () => ({ lean: async () => [product] }) });
  Device.exists = async () => false;
  Device.create = async data => ({ ...data, _id: '507f191e810c19729de860ea' });
  server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); wholesaleStub.close(); wholesaleStub.closeAllConnections(); }));
test('private endpoints reject unauthenticated requests and do not cache', async () => {
  for (const path of ['/api/users/profile', '/api/devices/allDevices', '/api/allTransceivers']) {
    const response = await request(path);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  }
});
test('cross-origin writes and simple form posts are rejected', async () => {
  assert.equal((await request('/api/users/login', { method: 'POST', headers: { origin: 'https://evil.test' }, body: '{}' })).status, 403);
  assert.equal((await request('/api/users/login', { method: 'POST', headers: { 'X-Requested-With': '' }, body: '{}' })).status, 403);
  assert.equal((await request('/api/users/login', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' })).status, 415);
});
test('login validates types and uses generic invalid credential errors', async () => {
  assert.equal((await request('/api/users/login', { method: 'POST', body: JSON.stringify({ email: { $ne: null }, password: 'x' }) })).status, 400);
  const responses = [];
  for (const email of [user.email, 'absent@example.test']) {
    const response = await request('/api/users/login', { method: 'POST', body: JSON.stringify({ email, password: 'wrong' }) });
    assert.equal(response.status, 401); responses.push(await response.json());
  }
  assert.deepEqual(responses[0], responses[1]);
});
test('login, profile, inventory, role denial, rotation, logout and token replay', async () => {
  const login = () => request('/api/users/login', { method: 'POST', body: JSON.stringify({ email: user.email.toUpperCase(), password: 'example password for testing' }) });
  let response = await login();
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(data.expiresAt > data.serverTime);
  assert.ok(data.expiresAt - data.serverTime <= 3600000);
  assert.equal(data.password, undefined);
  const setCookie = response.headers.getSetCookie().find(value => value.startsWith('auth_token='));
  assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /SameSite=Strict/); assert.match(setCookie, /Max-Age=3600/);
  cookie = setCookie.split(';')[0];
  assert.equal((await request('/api/users/profile')).status, 200);
  assert.equal((await request('/api/audit/events')).status, 403);
  assert.equal((await request('/api/audit/delivery')).status, 403);
  assert.equal((await request('/api/devices/allDevices')).status, 200);
  assert.equal((await request('/api/users/register', { method: 'POST', body: '{}' })).status, 403);
  response = await request('/api/devices/addDevices', { method: 'POST', body: JSON.stringify(product) });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).data.cantidad, 1);
  assert.equal((await request('/api/devices/editDevice/invalid', { method: 'PATCH', body: '{}' })).status, 400);
  const previous = cookie;
  response = await login();
  cookie = response.headers.getSetCookie().find(value => value.startsWith('auth_token=')).split(';')[0];
  assert.notEqual(cookie, previous);
  assert.equal((await request('/api/users/profile', { headers: { cookie: previous } })).status, 401);
  user.isActive = false;
  assert.equal((await request('/api/users/profile')).status, 401);
  user.isActive = true;
  assert.equal((await request('/api/users/logout', { method: 'POST', body: '{}' })).status, 200);
  assert.equal((await request('/api/users/profile')).status, 401);
  cookie = undefined;
});
test('JWT rejects tampering, algorithm substitution, audience mismatch and expiry', () => {
  const config = getConfig();
  const payload = { sub: user._id, jti: 'test', exp: Math.floor(Date.now() / 1000) + 60, iss: config.issuer, aud: config.audience };
  const token = jwt.sign(payload, config.secret, { algorithm: 'HS256' });
  assert.equal(verifyToken(token).sub, user._id);
  assert.throws(() => verifyToken(token + 'tampered'));
  assert.throws(() => verifyToken(jwt.sign(payload, config.secret, { algorithm: 'HS384' })));
  assert.throws(() => verifyToken(jwt.sign({ ...payload, aud: 'other' }, config.secret)));
  assert.throws(() => verifyToken(jwt.sign({ ...payload, exp: 1 }, config.secret)));
});
test('validation rejects Mongo operators, extra fields, duplicate series, wrong quantities and invalid enums', () => {
  assert.equal(validateInventory(product).cantidad, 1);
  assert.deepEqual(validateInventory({ descripcion: 'Updated' }, true), { descripcion: 'Updated' });
  for (const body of [{ ...product, $set: { role: 'admin' } }, { ...product, role: 'admin' }, { ...product, s_n: ['A', 'A'], cantidad: 2 }, { ...product, cantidad: -1 }, { ...product, state: 'anything' }, { ...product, p_n: { $ne: null } }, { ...product, s_n: [''] }]) assert.throws(() => validateInventory(body));
});
test('rate limiter caps attempts and supplies retry time', () => {
  const limit = loginLimiter({ limit: 2 });
  let passed = 0, status, retry;
  const res = { set: (_, value) => { retry = value; }, status: value => { status = value; return res; }, json: () => {} };
  for (let i = 0; i < 3; i++) limit({ ip: 'test' }, res, () => passed++);
  assert.equal(passed, 2); assert.equal(status, 429); assert.ok(Number(retry) > 0);
});
test('malformed and oversized JSON do not expose internal errors', async () => {
  const invalid = await request('/api/users/login', { method: 'POST', body: '{' });
  assert.equal(invalid.status, 400); assert.equal((await invalid.json()).stack, undefined);
  const large = await request('/api/users/login', { method: 'POST', body: JSON.stringify({ value: 'x'.repeat(70000) }) });
  assert.equal(large.status, 413);
});
