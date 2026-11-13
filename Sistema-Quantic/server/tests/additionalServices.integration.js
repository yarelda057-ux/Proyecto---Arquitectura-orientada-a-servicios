import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAdditionalServicesRouter } from '../routes/additionalServicesRoutes.js';

const key = randomBytes(32).toString('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections?.(); });
let mode = 'ok'; let lastUrl; let lastHeaders; let calls = 0;
const upstream = http.createServer((req, res) => {
  calls++; lastUrl = req.url; lastHeaders = req.headers;
  if (mode === 'timeout') return;
  if (mode === 'unavailable') { res.writeHead(500); res.end('private upstream error'); return; }
  res.setHeader('Content-Type', 'application/json');
  if (mode === 'invalid') { res.end('{'); return; }
  if (mode === 'hidden') { res.end(JSON.stringify({ status: 'success', datos: { estado: 'APROBADO', empresa: { estado_verificacion: 'INACTIVO' } } })); return; }
  const isDetail = /\/1$/.test(req.url);
  res.end(JSON.stringify({ status: 'success', datos: isDetail ? { id: 1, estado_verificacion: 'APROBADO', estado: 'APROBADO', empresa: { estado_verificacion: 'APROBADO' } } : [{ id: 1, nombre: 'Servicio de prueba' }] }));
});
let esb; let gateway; let providerPort;
try {
  providerPort = await listen(upstream);
  const probe = http.createServer(); const esbPort = await listen(probe); await close(probe);
  Object.assign(process.env, { INTEGRATION_ESB_URL: `http://127.0.0.1:${esbPort}`, INTEGRATION_ESB_KEY: key, NODE_ENV: 'test', JWT_SECRET: randomBytes(32).toString('hex') });
  esb = spawn(process.execPath, ['src/index.js'], {
    cwd: fileURLToPath(new URL('../../integration-esb/', import.meta.url)), windowsHide: true, stdio: 'ignore',
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(esbPort), ESB_API_KEY: key, NOTIFICATION_SERVICE_KEY: randomBytes(32).toString('hex'), ADDITIONAL_SERVICES_URL: `http://127.0.0.1:${providerPort}`, ADDITIONAL_SERVICES_TIMEOUT_MS: '500' },
  });
  const deadline = Date.now() + 10000; let ready = false;
  while (Date.now() < deadline) {
    try { ready = (await fetch(`http://127.0.0.1:${esbPort}/health/live`)).ok; } catch { /* boot */ }
    if (ready) break; await delay(100);
  }
  assert.ok(ready, 'ESB must start');
  const app = express();
  // Autenticación simulada solo en esta prueba; el router de producción usa validateAuth.
  app.use('/catalog', createAdditionalServicesRouter({ authenticate(req, _res, next) { req.user = { role: req.get('X-Test-Role') || 'user' }; next(); } }));
  app.use('/protected', createAdditionalServicesRouter());
  gateway = http.createServer(app); const port = await listen(gateway); const base = `http://127.0.0.1:${port}`;
  let response = await fetch(base + '/catalog/servicios?ciudad=Lima&q=soporte%20t%C3%A9cnico');
  assert.equal(response.status, 200); assert.equal((await response.json()).datos.length, 1);
  assert.equal(new URL(lastUrl, 'http://local').searchParams.get('q'), 'soporte técnico');
  assert.equal(lastHeaders['x-esb-key'], undefined, 'ESB secret must not be forwarded to the provider');
  assert.ok(lastHeaders['x-correlation-id']);
  for (const path of ['empresas', 'empresas/1', 'servicios/1']) assert.equal((await fetch(base + '/catalog/' + path)).status, 200);
  assert.equal((await fetch(base + '/protected/servicios')).status, 401);
  for (const role of ['unknown']) assert.equal((await fetch(base + '/catalog/servicios', { headers: { 'X-Test-Role': role } })).status, 403);
  assert.equal((await fetch(base + '/catalog/empresas', { headers: { 'X-Test-Role': 'admin' } })).status, 200);
  for (const resource of ['servicios', 'servicios/1', 'empresas', 'empresas/1']) assert.equal((await fetch(base + '/catalog/' + resource, { headers: { 'X-Test-Role': 'mayorista' } })).status, 200, 'Los proveedores pueden consultar el catálogo y sus detalles');
  assert.equal((await fetch(base + '/catalog/servicios', { method: 'POST', headers: { 'X-Test-Role': 'mayorista' } })).status, 404, 'El acceso de proveedores es de consulta');
  const previousCalls = calls;
  for (const path of ['servicios?url=http://external', 'servicios?q=a&q=b', 'empresas?categoria=x', 'servicios/0', 'demo-admin']) assert.ok([400, 404].includes((await fetch(base + '/catalog/' + path)).status));
  assert.equal((await fetch(base + '/catalog/servicios', { method: 'POST' })).status, 404);
  assert.equal(calls, previousCalls, 'Rejected requests must not reach the provider');
  assert.equal((await fetch(`http://127.0.0.1:${esbPort}/v1/additional-services/servicios`)).status, 401);
  mode = 'hidden'; assert.equal((await fetch(base + '/catalog/servicios/1')).status, 404);
  mode = 'unavailable'; response = await fetch(base + '/catalog/servicios'); assert.equal(response.status, 503); assert.ok(!(await response.text()).includes('private upstream'));
  mode = 'timeout'; assert.equal((await fetch(base + '/catalog/servicios')).status, 504);
  mode = 'invalid'; assert.equal((await fetch(base + '/catalog/servicios')).status, 503);
  mode = 'ok'; assert.equal((await fetch(base + '/catalog/servicios')).status, 200, 'Must recover after upstream failure');
  console.log('OK: inventario → ESB → REST, filtros, detalles, roles, autenticación ESB, fallos, timeout y recuperación. Sin escrituras en bases de datos.');
} finally {
  if (gateway) await close(gateway);
  if (esb && esb.exitCode === null) { const stopped = new Promise(resolve => esb.once('exit', resolve)); esb.kill(); await Promise.race([stopped, delay(3000)]); }
  if (upstream.listening) await close(upstream);
}
