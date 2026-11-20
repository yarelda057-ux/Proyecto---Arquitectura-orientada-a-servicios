const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { Supervisor, assertPortFree } = require('./iniciar-proyecto.cjs');
async function port() {
  const s = net.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r));
  const p = s.address().port; await new Promise(r => s.close(r)); return p;
}
async function fixture(body = '{}', status = 200) {
  const p = await port();
  return { name: 'prueba', command: process.execPath, args: ['-e', `require('node:http').createServer((q,s)=>{s.writeHead(${status});s.end(${JSON.stringify(body)})}).listen(${p},'127.0.0.1')`], cwd: __dirname, env: process.env, url: `http://127.0.0.1:${p}`, port: p };
}
test('inicia dos procesos y libera ambos puertos al detenerlos', async () => {
  const services = [await fixture(), await fixture()]; const s = new Supervisor({ log() {}, timeout: 5000 });
  try { await s.start(services); for (const f of services) assert.equal((await fetch(f.url)).status, 200); }
  finally { await s.stop(); }
  for (const f of services) await assertPortFree(f.port);
});
test('detecta un puerto ocupado sin terminar el proceso ajeno', async () => {
  const service = await fixture(); const s = new Supervisor({ log() {}, timeout: 5000 });
  try { await s.start([service]); await assert.rejects(assertPortFree(service.port), /ocupado/); assert.equal((await fetch(service.url)).status, 200); }
  finally { await s.stop(); }
});
test('un servicio no listo revierte los procesos ya iniciados', async () => {
  const services = [await fixture(), await fixture('{}', 503)]; const s = new Supervisor({ log() {}, timeout: 1200 });
  await assert.rejects(s.start(services), /no esta listo/);
  for (const f of services) await assertPortFree(f.port);
});
test('rechaza MySQL en modo memoria y detiene el proceso', async () => {
  const service = await fixture(JSON.stringify({base_de_datos:{estado:'MODO_DEMO_MEMORIA'}})); service.mysql = true;
  const s = new Supervisor({ log() {}, timeout: 3000 });
  await assert.rejects(s.start([service]), /modo memoria/); await assertPortFree(service.port);
});
