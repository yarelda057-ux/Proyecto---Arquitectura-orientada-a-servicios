// Diagnóstico de solo lectura. No imprime secretos ni modifica bases de datos.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { createRequire } = require('node:module');
const { parseEnv } = require('node:util');
const root = path.resolve(__dirname, '..');
const services = [
  ['server', 3000, '/api/health'],
  ['servicio-de-mayoristas', 3001, '/health/ready'],
  ['audit-service', 8001, '/health/ready'],
  ['notification-service', 8002, '/health/ready'],
  ['integration-esb', 8003, '/health/live'],
  ['reports-service', 8004, '/health/ready'],
  ['srv-servicios-adicionales', 3002, '/api/v1/salud'],
  ['vite-project', 5173, '/'],
];
let failures = 0;
function show(ok, area, detail) {
  if (!ok) failures++;
  console.log(`${ok ? 'OK' : 'PENDIENTE'} | ${area} | ${detail}`);
}
function tcp(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(2500);
    const finish = result => { socket.destroy(); resolve(result); };
    socket.once('connect', () => finish('abierto'));
    socket.once('error', err => finish(err.code || 'error'));
    socket.once('timeout', () => finish('timeout'));
  });
}
async function main() {
  for (const [name] of services) {
    const directory = path.join(root, name);
    show(fs.existsSync(path.join(directory, '.env')), name, 'Archivo de configuración .env');
    const manifest = path.join(directory, 'package.json');
    if (fs.existsSync(manifest)) {
      const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      const localRequire = createRequire(manifest);
      const missing = Object.keys({ ...pkg.dependencies, ...(name === 'vite-project' ? pkg.devDependencies : {}) }).filter(dependency => {
        if (dependency.startsWith('@types/')) return !fs.existsSync(path.join(directory, 'node_modules', dependency, 'package.json'));
        try { localRequire.resolve(dependency); return false; } catch { return true; }
      });
      show(!missing.length, name, missing.length ? `Dependencias sin resolver: ${missing.join(', ')}` : 'Dependencias resolubles');
    }
  }
  for (const port of [27017, 3306]) {
    const state = await tcp(port);
    show(state === 'abierto', `TCP ${port}`, state === 'abierto' ? 'Conexión TCP disponible; aún debe validarse autenticación' : state);
  }
  // Comprobar que MongoDB permite las transacciones requeridas por el stock.
  try {
    const localRequire = createRequire(path.join(root, 'servicio-de-mayoristas/package.json'));
    const mongoose = localRequire('mongoose');
    const env = parseEnv(fs.readFileSync(path.join(root, 'servicio-de-mayoristas/.env'), 'utf8'));
    const connection = mongoose.createConnection(env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mayoristas', { serverSelectionTimeoutMS: 2500 });
    try {
      await connection.asPromise();
      const hello = await connection.db.admin().command({ hello: 1 });
      show(Boolean(hello.setName || hello.msg === 'isdbgrid'), 'MongoDB transaccional', hello.setName ? `Replica set ${hello.setName}` : hello.msg === 'isdbgrid' ? 'Mongos disponible' : 'Instancia standalone: falta replica set');
    } finally { await connection.close(); }
  } catch (err) { show(false, 'MongoDB transaccional', `No verificable (${err.code || err.name})`); }
  const results = await Promise.all(services.map(async ([name, port, endpoint]) => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${endpoint}`, { signal: AbortSignal.timeout(3500), redirect: 'error' });
      if (!response.ok) return [false, name, `Salud HTTP ${response.status}`];
      if (name === 'srv-servicios-adicionales') {
        const data = await response.json();
        if (data.base_de_datos?.estado !== 'CONECTADO') return [false, name, 'API responde, pero MySQL no tiene persistencia activa'];
      }
      return [true, name, `Responde en puerto ${port}; no sustituye una prueba funcional completa`];
    } catch (err) { return [false, name, `HTTP no verificable (${err.cause?.code || err.name})`]; }
  }));
  results.forEach(result => show(...result));
  console.log(`\nResultado: ${failures} comprobaciones pendientes.`);
  if (failures) console.log('EACCES indica acceso denegado por el entorno; ECONNREFUSED indica que no se pudo establecer una conexión con ese puerto.');
  process.exitCode = failures ? 1 : 0;
}
main().catch(err => { console.error(`Diagnóstico interrumpido: ${err.code || err.name}`); process.exitCode = 1; });
