// Real HTTP + MongoDB replica set + MySQL + SQLite + Python audit service.
// Creates disposable databases and owns all processes it stops. Never uses user records.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomBytes, createHash, randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const { parseEnv } = require('node:util');
const root = path.resolve(__dirname, '..');
const reqFor = name => createRequire(path.join(root, name, 'package.json'));
const { MongoClient, ObjectId } = reqFor('servicio-de-mayoristas')('mongoose').mongo;
const mysql = reqFor('srv-servicios-adicionales')('mysql2/promise');
const jwt = reqFor('server')('jsonwebtoken');
const bcrypt = reqFor('server')('bcrypt');
const ExcelJS = reqFor('servicio-de-mayoristas')('exceljs');
const suffix = randomBytes(6).toString('hex');
const work = path.join(root, 'tmp', 'reports-integration-' + suffix);
fs.mkdirSync(work, { recursive: true });
const dbs = ['main', 'stock', 'audit'].map(name => 'quantic_analytics_test_' + name + '_' + suffix);
const sqlName = 'quantic_prueba_' + Date.now();
const secret = () => randomBytes(32).toString('hex');
const keys = { auth: secret(), stockAuth: secret(), stock: secret(), company: secret(), esb: secret(), reports: secret(), auditWrite: secret(), auditRead: secret(), soap: secret() };
const password = secret();
const children = [];
let mongo, sql, createdSql = false;
let previewServer;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
function launch(name, folder, command, args, env) {
  const fd = fs.openSync(path.join(work, name + '.log'), 'a');
  const child = spawn(command, args, { cwd: path.join(root, folder), env: { ...process.env, NODE_ENV: 'test', ...env }, windowsHide: true, stdio: ['ignore', fd, fd] });
  fs.closeSync(fd); children.push(child); child.on('error', err => console.error(name + ': ' + err.code));
  return child;
}
async function waitFor(check, label, timeout = 30000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (await check()) return; await delay(300); }
  throw new Error('Tiempo agotado: ' + label);
}
async function ready(base, endpoint) {
  await waitFor(async () => { try { return (await fetch(base + endpoint, { signal: AbortSignal.timeout(1000) })).ok; } catch { return false; } }, endpoint);
}
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode) return;
  await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); setTimeout(resolve, 4000).unref(); });
}
async function visualCheck(mainUrl, cookie) {
  const browser = process.env.QUANTIC_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  if (!fs.existsSync(browser)) { console.log('Vista de navegador omitida: define QUANTIC_TEST_BROWSER.'); return; }
  const dist = path.resolve(root, 'vite-project/dist');
  previewServer = http.createServer(async (req, res) => {
    try {
      if (req.url.startsWith('/api/')) {
        const data = []; for await (const chunk of req) data.push(chunk);
        const upstream = await fetch(mainUrl + req.url, { method: req.method, headers: { Cookie: req.headers.cookie || '', Origin: 'http://localhost:5173', 'X-Requested-With': 'QuanticWeb', 'Content-Type': 'application/json' }, ...(!['GET', 'HEAD'].includes(req.method) ? { body: Buffer.concat(data) } : {}) });
        res.writeHead(upstream.status, { 'Content-Type': 'application/json' }); res.end(await upstream.text()); return;
      }
      const requested = path.resolve(dist, '.' + new URL(req.url, 'http://localhost').pathname);
      if (!requested.startsWith(dist + path.sep)) { res.writeHead(403); res.end(); return; }
      const file = fs.existsSync(requested) && fs.statSync(requested).isFile() ? requested : path.join(dist, 'index.html');
      const contentType = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType }); res.end(fs.readFileSync(file));
    } catch { res.writeHead(502); res.end(); }
  });
  await new Promise(resolve => previewServer.listen(0, '127.0.0.1', resolve));
  const previewUrl = 'http://127.0.0.1:' + previewServer.address().port;
  const debugPort = await freePort();
  const profilePath = fs.mkdtempSync(path.join(os.tmpdir(), 'quantic-browser-'));
  const child = launch('browser', '', browser, ['--headless=new', '--disable-gpu', '--disable-background-networking', '--disable-sync', '--disable-crash-reporter', '--disable-breakpad', '--no-first-run', '--remote-debugging-port=' + debugPort, '--user-data-dir=' + profilePath, 'about:blank'], {});
  let target;
  await waitFor(async () => { try { target = (await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json()).find(t => t.type === 'page'); return Boolean(target); } catch { return false; } }, 'navegador');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let nextId = 0; const pending = new Map(); const errors = [];
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    const waiter = pending.get(message.id);
    if (waiter) { pending.delete(message.id); clearTimeout(waiter.timer); message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result); }
  };
  const command = (method, params = {}) => new Promise((resolve, reject) => { const id = ++nextId; const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 10000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); });
  try {
    await command('Runtime.enable'); await command('Network.enable'); await command('Page.enable');
    const authCookie = cookie.split('; ').find(c => c.startsWith('auth_token=')); assert.ok(authCookie);
    await command('Network.setCookie', { name: 'auth_token', value: authCookie.slice('auth_token='.length), url: previewUrl, httpOnly: true, sameSite: 'Strict' });
    await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
    await command('Page.navigate', { url: previewUrl + '/Reports' });
    await waitFor(async () => (await command('Runtime.evaluate', { expression: "document.querySelectorAll('.reports-chart').length", returnByValue: true })).result?.value === 3, 'graficos del dashboard');
    assert.deepEqual(errors, []);
    const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(work, 'dashboard-desktop.png'), Buffer.from(screenshot.data, 'base64'));
    await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await delay(250);
    const overflow = await command('Runtime.evaluate', { expression: 'document.documentElement.scrollWidth > window.innerWidth', returnByValue: true });
    assert.equal(overflow.result.value, false, 'El documento movil no debe desbordarse horizontalmente');
    const mobile = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(work, 'dashboard-mobile.png'), Buffer.from(mobile.data, 'base64'));
    console.log('OK: dashboard real en Chrome, tres graficos, escritorio y movil sin errores de JavaScript.');
  } finally {
    await command('Browser.close').catch(() => {}); socket.close(); await stop(child);
    previewServer.closeAllConnections(); await new Promise(resolve => previewServer.close(resolve)); previewServer = null;
  }
}
async function main() {
  const ports = {};
  for (const name of ['main', 'stock', 'company', 'esb', 'reports', 'audit']) ports[name] = await freePort();
  assert.equal(new Set(Object.values(ports)).size, 6);
  const urls = Object.fromEntries(Object.entries(ports).map(([name, port]) => [name, 'http://127.0.0.1:' + port]));
  const mongoUri = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27018/?replicaSet=quanticTest';
  mongo = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 3000 }); await mongo.connect();
  assert.ok((await mongo.db('admin').command({ hello: 1 })).setName, 'Se requiere replica set');
  const [mainDb, stockDb, auditDb] = dbs.map(name => mongo.db(name));
  const uri = name => { const parsed = new URL(mongoUri); parsed.pathname = '/' + name; return parsed.toString(); };
  const sqlEnv = parseEnv(fs.readFileSync(path.join(root, 'srv-servicios-adicionales/.env'), 'utf8'));
  sql = await mysql.createConnection({ host: sqlEnv.DB_HOST || 'localhost', port: Number(sqlEnv.DB_PORT || 3306), user: sqlEnv.DB_USER || 'root', password: sqlEnv.DB_PASSWORD || '', multipleStatements: true, connectTimeout: 5000 });
  const [existing] = await sql.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?', [sqlName]);
  assert.equal(existing.length, 0, 'La base temporal no debe existir');
  await sql.query('CREATE DATABASE `' + sqlName + '`'); createdSql = true;
  await sql.query(fs.readFileSync(path.join(root, 'srv-servicios-adicionales/database/schema.sql'), 'utf8').replaceAll('quantic_servicios_db', sqlName));
  await sql.query("INSERT INTO empresas (razon_social,ruc,email_contacto,telefono,ciudad,provee_equipos,ofrece_servicios,estado_verificacion) VALUES ('Empresa fixture','20609999991','supplier@example.test','000000000','Lima',1,0,'APROBADO')");
  const adminId = new ObjectId();
  await mainDb.collection('users').insertOne({ _id: adminId, email: 'admin@example.test', password: await bcrypt.hash(password, 12), role: 'admin', isActive: true });
  const clientsPath = path.join(work, 'audit-clients.json');
  fs.writeFileSync(clientsPath, JSON.stringify([
    { id: 'write', source: 'inventory', key_sha256: createHash('sha256').update(keys.auditWrite).digest('hex'), scopes: ['events:write'] },
    { id: 'read', source: 'inventory', key_sha256: createHash('sha256').update(keys.auditRead).digest('hex'), scopes: ['events:read'] },
  ]));
  const python = path.join(root, 'audit-service/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const startAudit = () => launch('audit', 'audit-service', python, ['-m', 'uvicorn', 'app.main:create_app', '--factory', '--host', '127.0.0.1', '--port', String(ports.audit), '--no-access-log'], { AUDIT_MONGODB_URI: uri(dbs[2]), AUDIT_DB_NAME: dbs[2], AUDIT_CLIENTS_FILE: clientsPath });
  let auditProcess = startAudit(); await ready(urls.audit, '/health/ready');
  launch('company', 'srv-servicios-adicionales', process.execPath, ['src/server.js'], { ...sqlEnv, PORT: String(ports.company), DB_NAME: sqlName, COMPANY_INTEGRATION_KEY: keys.company, WHOLESALE_INTEGRATION_KEY: keys.stock, WHOLESALE_SERVICE_URL: urls.stock });
  await ready(urls.company, '/api/v1/salud');
  launch('stock', 'servicio-de-mayoristas', process.execPath, ['index.js'], { PORT: String(ports.stock), MONGODB_URI: uri(dbs[1]), JWT_SECRET: keys.stockAuth, INTEGRATION_KEY: keys.stock, COMPANY_INTEGRATION_KEY: keys.company, COMPANY_SERVICE_URL: urls.company, INTEGRATION_ESB_URL: urls.esb, INTEGRATION_ESB_KEY: keys.esb });
  await ready(urls.stock, '/health/ready');
  launch('esb', 'integration-esb', process.execPath, ['src/index.js'], { PORT: String(ports.esb), HOST: '127.0.0.1', ESB_API_KEY: keys.esb, NOTIFICATION_SERVICE_KEY: keys.soap, WHOLESALE_SERVICE_URL: urls.stock, REPORTS_SERVICE_URL: urls.reports });
  await ready(urls.esb, '/health/live');
  const startMain = () => launch('main', 'server', process.execPath, ['index.js'], { PORT: String(ports.main), MONGODB_URI: uri(dbs[0]), JWT_SECRET: keys.auth, CLIENT_ORIGINS: 'http://localhost:5173', WHOLESALE_SERVICE_URL: urls.stock, WHOLESALE_INTEGRATION_KEY: keys.stock, COMPANY_INTEGRATION_KEY: keys.company, INTEGRATION_ESB_URL: urls.esb, INTEGRATION_ESB_KEY: keys.esb, REPORTS_INTEGRATION_KEY: keys.reports, AUDIT_ENABLED: 'true', AUDIT_SERVICE_URL: urls.audit, AUDIT_WRITE_KEY: keys.auditWrite, AUDIT_READ_KEY: keys.auditRead });
  let mainProcess = startMain(); await ready(urls.main, '/api/health');
  const startReports = () => launch('reports', 'reports-service', process.execPath, ['src/index.js'], { PORT: String(ports.reports), REPORTS_DB_PATH: path.join(work, 'reports.sqlite'), REPORTS_CLIENTS_JSON: JSON.stringify({ 'inventory-gateway': { secret: keys.reports, scopes: ['reports:read', 'reports:write'] } }), STOCK_SOURCE_URL: urls.esb + '/v1/inventory-source', SOURCE_ESB_KEY: keys.esb });
  const companyToken = jwt.sign({ role: 'admin' }, keys.company, { subject: String(adminId), issuer: 'inventory-gateway', audience: 'company-api', expiresIn: 60 });
  const [companies] = await sql.query("SELECT id FROM empresas WHERE ruc='20609999991'");
  const access = await fetch(urls.company + '/api/v1/integracion/empresas/' + companies[0].id + '/acceso', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + companyToken }, body: JSON.stringify({ email: 'supplier@example.test', password, accion: 'crear' }) });
  assert.equal(access.status, 200, JSON.stringify(await access.json()));
  async function call(route, { method = 'GET', body, cookie = '', key } = {}) {
    const response = await fetch(urls.main + '/api' + route, { method, signal: AbortSignal.timeout(15000), headers: { Cookie: cookie, Origin: 'http://localhost:5173', 'X-Requested-With': 'QuanticWeb', 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json(); return { status: response.status, data, cookie: response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
  }
  const login = async email => { const r = await call('/users/login', { method: 'POST', body: { email, password } }); assert.equal(r.status, 200, JSON.stringify(r.data)); return r; };
  const admin = (await login('admin@example.test')).cookie;
  const supplierLogin = await login('supplier@example.test');
  assert.equal(supplierLogin.data.canUploadStock, true);
  const supplier = supplierLogin.cookie;
  const supplierId = supplierLogin.data.idMayorista;
  const upload = async (qty, label) => {
    const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('Stock');
    sheet.addRows([['PartNumber', 'Descripcion', 'QTY', 'Precio US$'], [null, 'Firewalls solo HW'], ['FG-1', 'FortiGate 40F', qty, 20], [null, 'Otros productos'], ['SW-1', 'Switch Cisco 24 ports', 0, 10], ['LP-1', 'Laptop ThinkPad', 2, 30], ['X-1', 'Producto sin detalle', 1, 2]]);
    const accepted = await call('/v1/stock/upload', { method: 'POST', cookie: supplier, key: 'upload-' + label, body: { idMayorista: supplierId, formato: 'XLSX', nombreArchivo: 'fixture.xlsx', archivoBase64: Buffer.from(await book.xlsx.writeBuffer()).toString('base64') } });
    assert.equal(accepted.status, 202, JSON.stringify(accepted.data));
    const validation = await call('/v1/stock/upload/' + accepted.data.idLote + '/validate', { cookie: supplier });
    assert.equal(validation.data.esValido, true); assert.equal(validation.data.categorias.length, 4);
    const body = { idOperacion: randomUUID() }, route = '/v1/stock/lotes/' + accepted.data.idLote + '/confirmacion';
    const confirmed = await call(route, { method: 'POST', cookie: supplier, key: 'confirm-' + label, body });
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data));
    const duplicate = await call(route, { method: 'POST', cookie: supplier, key: 'confirm-' + label, body });
    assert.deepEqual(duplicate.data, confirmed.data);
    return confirmed.data;
  };
  const first = await upload(5, 'first');
  assert.equal(await stockDb.collection('stocksnapshots').countDocuments({}), 1);
  console.log('OK: registro, acceso de empresa, carga por ESB, categorias e idempotencia.');
  await waitFor(async () => (await mainDb.collection('analyticsjobs').findOne({ _id: first.versionInventario }))?.state === 'failed', 'reintentos limitados con S4 apagado', 45000);
  assert.equal((await mainDb.collection('analyticsjobs').findOne({ _id: first.versionInventario })).attempts, 4);
  const second = await upload(8, 'second');
  // A restart must preserve the failed job; a newer upload must not erase its snapshot.
  await stop(mainProcess); mainProcess = startMain(); await ready(urls.main, '/api/health');
  assert.equal((await mainDb.collection('analyticsjobs').findOne({ _id: first.versionInventario })).state, 'failed');
  let reportsProcess = startReports(); await ready(urls.reports, '/health/ready');
  const retried = await call('/v1/inventario/procesos/' + first.versionInventario + '/reintentar', { method: 'POST', body: {}, cookie: admin });
  assert.equal(retried.status, 202);
  await waitFor(async () => await mainDb.collection('analyticsjobs').countDocuments({ state: 'complete' }) === 2, 'recuperacion de dos versiones y auditoria');
  const saved = await call('/v1/inventario/dashboards/DASH-01', { cookie: admin });
  assert.equal(saved.data.resultado.versionInventario, second.versionInventario);
  assert.equal(saved.data.resultado.indicadores.unidadesDisponibles, 11);
  console.log('OK: caida de S4, 3 reintentos, reinicio, recuperacion de versiones y auditoria real.');
  const stockToken = jwt.sign({ role: 'admin', purpose: 'analytics-source' }, keys.stock, { subject: '000000000000000000000004', issuer: 'inventory-gateway', audience: 'wholesale-api', expiresIn: 60 });
  const historical = await fetch(urls.stock + '/api/v1/stock/snapshot?versionInventario=' + first.versionInventario, { headers: { Authorization: 'Bearer ' + stockToken } });
  const original = await historical.json(); assert.equal(original.productos.reduce((sum, p) => sum + p.stock, 0), 8);
  const forbidden = await fetch(urls.stock + '/api/v1/stock/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + stockToken, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(forbidden.status, 403);
  const restricted = await call('/v1/inventario/dashboards/DASH-01?actual=true', { cookie: supplier }); assert.equal(restricted.status, 403);
  const live = await call('/v1/inventario/dashboards/DASH-01?actual=true', { cookie: admin });
  assert.equal(live.status, 200); assert.equal(live.data.grupos.length, 4); assert.equal(live.data.indicadores.productosSinStock, 1);
  const report = await call('/v1/inventario/reportes', { method: 'POST', cookie: admin, body: { tipo: 'stockActual', formato: 'JSON', filtros: {}, versionInventario: second.versionInventario } });
  assert.equal(report.status, 201); assert.equal(report.data.datos.length, 4);
  const configured = await call('/v1/inventario/dashboards/DASH-01', { method: 'PUT', cookie: admin, body: { nombre: 'Redes fixture', indicadores: ['totalProductos', 'productosConStock', 'productosSinStock', 'unidadesDisponibles'], filtros: { categoria: 'Redes' } } });
  assert.equal(configured.status, 200); assert.equal(configured.data.indicadores.totalProductos, 1);
  await stop(reportsProcess); reportsProcess = startReports(); await ready(urls.reports, '/health/ready');
  assert.equal((await call('/v1/inventario/dashboards/DASH-01', { cookie: admin })).data.nombre, 'Redes fixture');
  console.log('OK: reportes JSON, filtros, datos historicos, aislamiento de permisos y persistencia SQLite.');
  // Audit downtime must not repeat S4 or stock, and success requires an actual S1 receipt.
  await stop(auditProcess);
  const third = await upload(9, 'third');
  await waitFor(async () => { const job = await mainDb.collection('analyticsjobs').findOne({ _id: third.versionInventario }); return job?.dashboardDone && !job.auditDone && job.attempts > 0; }, 'auditoria pendiente con dashboard ya actualizado');
  auditProcess = startAudit(); await ready(urls.audit, '/health/ready');
  await waitFor(async () => (await mainDb.collection('analyticsjobs').findOne({ _id: third.versionInventario }))?.state === 'complete', 'recuperacion de auditoria');
  const finalJob = await mainDb.collection('analyticsjobs').findOne({ _id: third.versionInventario });
  // Query the public audit interface instead of depending on its MongoDB schema.
  const auditResponse = await fetch(urls.audit + '/v1/events?path=%2Fapi%2Fv1%2Finventario%2Factualizaciones&limit=100', { headers: { Authorization: 'Bearer ' + keys.auditRead } });
  assert.equal(auditResponse.status, 200);
  const auditEvents = await auditResponse.json();
  assert.equal(auditEvents.items.filter(e => e.event_id === finalJob.auditId).length, 1);
  assert.equal(await stockDb.collection('stocksnapshots').countDocuments({}), 3);
  assert.equal((await call('/v1/inventario/dashboards/DASH-01', { cookie: admin })).data.filtros.categoria, 'Redes');
  console.log('OK: auditoria recuperada sin duplicados y filtros preservados tras una nueva carga.');
  await call('/v1/inventario/dashboards/DASH-01', { method: 'PUT', cookie: admin, body: { nombre: 'Disponibilidad comercial', indicadores: ['totalProductos', 'productosConStock', 'productosSinStock', 'unidadesDisponibles'], filtros: {} } });
  if (process.env.QUANTIC_VISUAL_TESTS === 'true') await visualCheck(urls.main, admin);
  fs.writeFileSync(path.join(work, 'resultado.json'), JSON.stringify({ ok: true, visualSolicitada: process.env.QUANTIC_VISUAL_TESTS === 'true', fecha: new Date().toISOString(), pruebas: ['registro y login', 'Excel y categorias', 'confirmacion idempotente', 'S4 apagado y reintentos 1/2/4', 'reinicio del coordinador', 'snapshot historico', 'reportes y filtros', 'permisos', 'SQLite tras reinicio', 'recuperacion S1 sin duplicados'] }, null, 2));
  console.log('PRUEBA COMPLETA OK. Resultado: ' + path.relative(root, path.join(work, 'resultado.json')));
}
main().catch(err => { console.error('FALLO:', err.message); console.error('Logs: ' + path.relative(root, work)); process.exitCode = 1; }).finally(async () => {
  for (const child of [...children].reverse()) await stop(child);
  if (previewServer) { previewServer.closeAllConnections(); await new Promise(resolve => previewServer.close(resolve)); }
  if (mongo) { for (const name of dbs) { assert.ok(/^quantic_analytics_test_(main|stock|audit)_[a-f0-9]{12}$/.test(name)); await mongo.db(name).dropDatabase().catch(() => {}); } await mongo.close(); }
  if (sql) { if (createdSql) { assert.ok(/^quantic_prueba_\d{13}$/.test(sqlName)); await sql.query('DROP DATABASE `' + sqlName + '`'); } await sql.end(); }
});
