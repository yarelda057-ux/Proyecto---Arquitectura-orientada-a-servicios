import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHandler } from '../src/app.js';
import { Repository } from '../src/repository.js';
import { sourceClient } from '../src/source.js';
import { validateSnapshot, calculate, fail } from '../src/domain.js';

const clients = { inventory: { secret: 'a'.repeat(64), scopes: ['reports:read', 'reports:write'] }, support: { secret: 'b'.repeat(64), scopes: ['reports:read', 'reports:write'] } };
const fixture = { versionInventario: 'INV-106', actualizadoEn: '2026-11-13T12:00:00Z', total: 3, productos: [
  { idProducto: 'P1', nombre: 'Switch', idMayorista: 'M1', categoria: 'redes', stock: 40 },
  { idProducto: 'P2', nombre: 'Router', idMayorista: 'M1', categoria: 'redes', stock: 0 },
  { idProducto: 'P3', nombre: 'Servidor', idMayorista: 'M2', categoria: 'servidores', stock: 5 }
] };
function token(issuer = 'inventory', changes = {}) {
  const now = Math.floor(Date.now() / 1000);
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const b = Buffer.from(JSON.stringify({ iss: issuer, sub: 'actor-1', aud: 'reports-api', iat: now, exp: now + 60, scopes: ['reports:read', 'reports:write'], ...changes })).toString('base64url');
  return 'Bearer ' + h + '.' + b + '.' + createHmac('sha256', clients[issuer].secret).update(h + '.' + b).digest('base64url');
}
async function setup(t, source = async ({ expected }) => validateSnapshot(fixture, expected)) {
  const repository = new Repository(':memory:', Object.keys(clients));
  const handler = createHandler({ repository, clients, source });
  // El modo HTTP real es optativo para entornos que permiten sockets locales.
  const server = process.env.REPORTS_HTTP_TESTS === 'true' ? createServer(handler) : null;
  if (server) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { if (server) await new Promise(resolve => server.close(resolve)); repository.close(); });
  return async (path, { method = 'GET', body, auth = token(), headers = {} } = {}) => {
    const data = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
    const requestHeaders = { Authorization: auth, 'Content-Type': 'application/json', 'X-Stock-Authorization': 'Bearer upstream-token', ...headers };
    if (!server) {
      const req = Readable.from(data === undefined ? [] : [Buffer.from(data)]);
      Object.assign(req, { method, url: '/api/v1/inventario' + path, headers: Object.fromEntries(Object.entries(requestHeaders).map(([k,v]) => [k.toLowerCase(),v])) });
      const responseHeaders = {}; let output;
      const res = { statusCode: 200, setHeader(k,v) { responseHeaders[k.toLowerCase()] = v; }, end(value) { output = JSON.parse(value); } };
      await handler(req, res);
      return { status: res.statusCode, body: output, correlation: responseHeaders['x-correlation-id'] };
    }
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/inventario${path}`, { method, headers: requestHeaders, ...(data !== undefined ? { body: data } : {}) });
    return { status: response.status, body: await response.json(), correlation: response.headers.get('x-correlation-id') };
  };
}
const reportBody = { tipo: 'stockActual', formato: 'JSON', filtros: { categoria: 'redes' }, versionInventario: 'INV-106' };
const dashBody = { nombre: 'Disponibilidad comercial', indicadores: ['productosConStock', 'productosSinStock'], filtros: { categoria: 'redes' }, versionInventario: 'INV-106' };

test('live dashboard returns current data, selectable categories, supplier groups and availability', async t => {
  const call = await setup(t);
  const r = await call('/dashboards/DASH-01?actual=true');
  assert.equal(r.status, 200); assert.equal(r.body.historico, false);
  assert.equal(r.body.proveedores.length, 2);
  assert.equal(r.body.grupos.find(g => g.categoria === 'redes').productosSinStock, 1);
  assert.deepEqual(r.body.catalogo.categorias, ['redes', 'servidores']);
  assert.equal((await call('/dashboards/DASH-01?actual=true&otro=1')).status, 400);
});
test('live dashboard never serves stale data as current when source fails', async t => {
  const call = await setup(t, async () => { throw fail(503, 'offline'); });
  assert.equal((await call('/dashboards/DASH-01?actual=true')).status, 503);
});
test('automatic update is idempotent, preserves user filters and isolates consumers', async t => {
  let reads = 0;
  const call = await setup(t, async ({ expected }) => { reads++; return validateSnapshot(fixture, expected); });
  await call('/dashboards/DASH-01', { method: 'PUT', body: dashBody });
  const body = { idOperacion: 'stock-106', versionInventario: 'INV-106' };
  const a = await call('/actualizaciones', { method: 'POST', body });
  const readsBeforeRetry = reads;
  const b = await call('/actualizaciones', { method: 'POST', body });
  assert.equal(a.status, 200); assert.deepEqual(a.body, b.body); assert.equal(reads, readsBeforeRetry);
  const config = (await call('/dashboards/DASH-01')).body;
  assert.deepEqual(config.filtros, dashBody.filtros); assert.equal(config.resultado.indicadores.productosConStock, 1);
  assert.equal((await call('/dashboards/DASH-01', { auth: token('support') })).body.resultado, undefined);
  assert.equal((await call('/actualizaciones', { method: 'POST', body: { ...body, versionInventario: 'INV-107' } })).status, 409);
  assert.equal((await call('/actualizaciones', { method: 'POST', body, auth: token('inventory', { scopes: ['reports:read'] }) })).status, 403);
});
test('late retries do not overwrite a newer dashboard version', async t => {
  const call = await setup(t, async ({ expected }) => validateSnapshot({ ...fixture, versionInventario: expected, revisionInventario: Number(expected.slice(4)) }, expected));
  const newer = await call('/actualizaciones', { method: 'POST', body: { idOperacion: 'update-108', versionInventario: 'INV-108' } });
  assert.equal(newer.status, 200);
  const older = await call('/actualizaciones', { method: 'POST', body: { idOperacion: 'update-107', versionInventario: 'INV-107' } });
  assert.equal(older.body.dashboards[0].estado, 'SUPERADO');
  assert.equal((await call('/dashboards/DASH-01')).body.resultado.versionInventario, 'INV-108');
  assert.equal((await call('/dashboards/DASH-01', { method: 'PUT', body: dashBody })).status, 409);
});
test('automatic receipts survive SQLite restart and transactions roll back all changes', () => {
  const folder = mkdtempSync(join(tmpdir(), 'quantic-updates-test-')); const path = join(folder, 'test.sqlite');
  let db = new Repository(path, ['inventory']);
  try {
    assert.throws(() => db.transaction(() => { db.saveUpdate('inventory', 'failed', { version: 1 }); throw new Error('simulated crash'); }));
    assert.equal(db.getUpdate('inventory', 'failed'), null);
    db.transaction(() => db.saveUpdate('inventory', 'ok', { version: 2 })); db.close();
    db = new Repository(path, ['inventory']); assert.deepEqual(db.getUpdate('inventory', 'ok'), { version: 2 });
  } finally { db.close(); rmSync(folder, { recursive: true }); }
});

test('indicadores: todos los registros, unidades y fecha de la fuente', async t => {
  const call = await setup(t); const r = await call('/indicadores'); assert.equal(r.status, 200);
  assert.deepEqual([r.body.totalProductos, r.body.productosConStock, r.body.productosSinStock, r.body.unidadesDisponibles], [3, 2, 1, 45]);
  assert.equal(r.body.versionInventario, 'INV-106'); assert.equal(r.body.actualizadoEn, fixture.actualizadoEn);
});
test('estadísticas agrupadas y filtradas según tabla 14', async t => {
  const call = await setup(t); const r = await call('/estadisticas?agruparPor=categoria&categoria=redes');
  assert.equal(r.status, 200); assert.deepEqual(r.body.grupos, [{ categoria: 'redes', totalProductos: 2, unidadesEnStock: 40 }]);
});
test('reporte 201 persistido con productos de la versión pedida', async t => {
  const call = await setup(t); const r = await call('/reportes', { method: 'POST', body: reportBody });
  assert.equal(r.status, 201); assert.equal(r.body.datos.length, 2); assert.equal(r.body.datos[0].productoId, 'P1');
  const saved = await call('/reportes/' + r.body.idReporte); assert.equal(saved.body.historico, true); assert.deepEqual(saved.body.datos, r.body.datos);
});
test('dashboard PUT calcula solo indicadores admitidos y guarda configuración', async t => {
  const call = await setup(t); const r = await call('/dashboards/DASH-01', { method: 'PUT', body: dashBody });
  assert.equal(r.status, 200); assert.deepEqual(r.body.indicadores, { productosConStock: 1, productosSinStock: 1 });
  const saved = await call('/dashboards/DASH-01'); assert.equal(saved.body.nombre, dashBody.nombre); assert.deepEqual(saved.body.filtros, dashBody.filtros);
});
test('sin registros produce ceros y vacío explícito', async t => {
  const call = await setup(t); const r = await call('/indicadores?categoria=inexistente');
  assert.equal(r.status, 200); assert.equal(r.body.sinRegistros, true); assert.equal(r.body.totalProductos, 0); assert.equal(r.body.unidadesDisponibles, 0);
  const stats = await call('/estadisticas?agruparPor=categoria&categoria=inexistente'); assert.deepEqual(stats.body.grupos, []);
});
test('400 ante tipos, formatos, filtros y agrupaciones inválidos', async t => {
  const call = await setup(t);
  for (const change of [{ tipo: 'ventas' }, { formato: 'PDF' }, { filtros: { secreto: 'x' } }, { versionInventario: '' }]) assert.equal((await call('/reportes', { method: 'POST', body: { ...reportBody, ...change } })).status, 400);
  for (const path of ['/indicadores?categoria=', '/indicadores?categoria=a&categoria=b', '/indicadores?stock=4', '/estadisticas?agruparPor=precio', '/estadisticas']) assert.equal((await call(path)).status, 400);
});
test('400 ante indicadores desconocidos o duplicados', async t => {
  const call = await setup(t);
  for (const indicadores of [[], ['ganancias'], ['totalProductos', 'totalProductos']]) assert.equal((await call('/dashboards/DASH-01', { method: 'PUT', body: { ...dashBody, indicadores } })).status, 400);
});
test('404 para dashboard inexistente; PUT no crea recursos implícitos', async t => {
  const call = await setup(t); assert.equal((await call('/dashboards/NO-EXISTE', { method: 'PUT', body: dashBody })).status, 404);
});
test('409 cuando ya no existe la versión; nunca sustituye por otra', async t => {
  const call = await setup(t); const r = await call('/reportes', { method: 'POST', body: { ...reportBody, versionInventario: 'INV-105' } });
  assert.equal(r.status, 409); assert.equal(r.body.datos, undefined);
});
test('caída de fuente 503: no presenta resultado almacenado como vigente', async t => {
  const call = await setup(t, async () => { throw fail(503, 'Fuente no disponible.'); });
  const r = await call('/dashboards/DASH-01', { method: 'PUT', body: dashBody }); assert.equal(r.status, 503); assert.equal(r.body.indicadores, undefined);
});
test('autenticación rechaza ausentes, firmas incorrectas, vencidos y audiencia errónea', async t => {
  const call = await setup(t);
  for (const auth of ['', token() + 'invalid', token('inventory', { exp: 1 }), token('inventory', { aud: 'stock' })]) assert.equal((await call('/indicadores', { auth })).status, 401);
});
test('scopes separan lectura de escritura', async t => {
  const call = await setup(t); const auth = token('inventory', { scopes: ['reports:read'] });
  assert.equal((await call('/indicadores', { auth })).status, 200);
  assert.equal((await call('/reportes', { method: 'POST', body: reportBody, auth })).status, 403);
});
test('otro sistema autorizado puede consumir API sin leer reportes del primer consumidor', async t => {
  const call = await setup(t); const r = await call('/reportes', { method: 'POST', body: reportBody });
  assert.equal((await call('/reportes/' + r.body.idReporte, { auth: token('support') })).status, 404);
  assert.equal((await call('/indicadores', { auth: token('support') })).status, 200);
});
test('creación explícita de dashboards y correlación', async t => {
  const call = await setup(t); const { versionInventario, ...body } = dashBody;
  const r = await call('/dashboards', { method: 'POST', body, headers: { 'X-Correlation-ID': 'OP-2026-05' } });
  assert.equal(r.status, 201); assert.equal(r.correlation, 'OP-2026-05'); assert.equal((await call('/dashboards/' + r.body.idDashboard)).status, 200);
});
test('JSON corrupto y cuerpo excesivo producen errores controlados', async t => {
  const call = await setup(t); assert.equal((await call('/reportes', { method: 'POST', body: '{oops' })).status, 400);
  assert.equal((await call('/reportes', { method: 'POST', body: { text: 'a'.repeat(70000) } })).status, 413);
});
test('repositorio conserva configuración y reportes tras reinicio', () => {
  const folder = mkdtempSync(join(tmpdir(), 'quantic-reports-test-')); const path = join(folder, 'test.sqlite');
  let db = new Repository(path, ['inventory']);
  try {
    db.updateDashboard('inventory', 'DASH-01', { nombre: 'Persistente' }); db.saveReport('inventory', 'R1', { datos: [1] }); db.close();
    db = new Repository(path, ['inventory']); assert.equal(db.getDashboard('inventory', 'DASH-01').nombre, 'Persistente'); assert.deepEqual(db.getReport('inventory', 'R1').datos, [1]);
  } finally { db.close(); rmSync(folder, { recursive: true }); }
});
test('fuente rechaza respuestas parciales, duplicados y cantidades inválidas', () => {
  for (const invalid of [{ ...fixture, total: 99 }, { ...fixture, actualizadoEn: null }, { ...fixture, productos: [...fixture.productos.slice(0, 2), fixture.productos[0]] }, { ...fixture, productos: fixture.productos.map(p => ({ ...p, stock: -1 })) }]) assert.throws(() => validateSnapshot(invalid), err => err.status === 503);
  assert.throws(() => calculate({ productos: [{ productoId: '1', categoria: 'x', stock: Number.MAX_SAFE_INTEGER }, { productoId: '2', categoria: 'x', stock: 1 }] }), err => err.status === 503);
});
test('adaptador HTTP propaga alcance, versión y correlación; valida la respuesta', async () => {
  let requested;
  const source = sourceClient({ url: 'http://127.0.0.1:8003/v1/inventory-source', esbKey: 'k', fetchImpl: async (url, options) => { requested = { url, options }; return Response.json(fixture); } });
  const r = await source({ token: 'Bearer authorized', correlationId: 'OP-1', expected: 'INV-106' });
  assert.equal(r.productos.length, 3); assert.equal(requested.url.searchParams.get('versionInventario'), 'INV-106'); assert.equal(requested.options.headers.Authorization, 'Bearer authorized'); assert.equal(requested.options.headers['X-Correlation-ID'], 'OP-1');
});
test('adaptador falla explícitamente ante timeout, fuente no autorizada y JSON inválido', async () => {
  for (const [fetchImpl, status] of [[async () => { throw new DOMException('timeout', 'TimeoutError'); }, 504], [async () => new Response('', { status: 403 }), 403], [async () => new Response('html'), 503]]) {
    const source = sourceClient({ url: 'http://127.0.0.1/source', fetchImpl });
    await assert.rejects(source({ token: 'Bearer authorized', correlationId: 'OP-1' }), err => err.status === status);
  }
});
