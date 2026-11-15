// Entorno aislado de prueba. No modifica el MongoDB de 27017 ni bases existentes de MySQL.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { parseEnv } = require('node:util');
const root = path.resolve(__dirname, '..');
const work = path.join(root, 'tmp/prueba-local');
const children = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let stopping = false;
const envFor = name => parseEnv(fs.readFileSync(path.join(root, name, '.env'), 'utf8'));
const requireFor = name => createRequire(path.join(root, name, 'package.json'));
async function stop() {
  if (stopping) return;
  stopping = true;
  console.log('\nDeteniendo los procesos iniciados por esta prueba...');
  for (const child of [...children].reverse()) {
    if (child.exitCode !== null || child.signalCode) continue;
    await new Promise(resolve => {
      child.once('exit', resolve);
      child.kill('SIGTERM');
      const timer = setTimeout(resolve, 3000); timer.unref();
    });
  }
}
process.on('SIGINT', () => void stop().then(() => process.exit(0)));
process.on('SIGTERM', () => void stop().then(() => process.exit(0)));
async function assertFree(port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(2000);
    socket.once('connect', () => { socket.destroy(); reject(new Error(`Puerto ${port} ocupado. Cierra la copia anterior antes de iniciar esta prueba.`)); });
    socket.once('error', e => e.code === 'ECONNREFUSED' ? resolve() : reject(new Error(`No se puede comprobar el puerto ${port}: ${e.code}.`)));
    socket.once('timeout', () => { socket.destroy(); reject(new Error(`No se pudo comprobar el puerto ${port}: timeout.`)); });
  });
}
function launch(name, command, args, overrides = {}, cwd = root) {
  const fd = fs.openSync(path.join(work, name + '.log'), 'a');
  const child = spawn(command, args, { cwd, env: { ...process.env, ...overrides }, windowsHide: true, stdio: ['ignore', fd, fd] });
  fs.closeSync(fd);
  children.push(child);
  child.on('error', err => console.error(`${name}: no pudo arrancar (${err.code}).`));
  return child;
}
async function ready(name, port, endpoint, child, mysql = false) {
  for (let attempt = 0; attempt < 25; attempt++) {
    if (stopping || child.exitCode !== null || child.signalCode || !child.pid) throw new Error(`${name} terminó al arrancar. Revisa tmp/prueba-local/${name}.log.`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}${endpoint}`, { signal: AbortSignal.timeout(1000), redirect: 'error' });
      if (response.ok) {
        if (name !== 'frontend') {
          const data = await response.json();
          if (mysql && data.base_de_datos?.estado !== 'CONECTADO') throw new Error('MYSQL_DEMO');
        }
        console.log(`OK: ${name}, puerto ${port}`); return;
      }
    } catch (err) { if (err.message === 'MYSQL_DEMO') throw new Error('Servicios adicionales respondió sin persistencia MySQL; la prueba no se considera válida.'); }
    await delay(500);
  }
  throw new Error(`${name} no está listo. Revisa tmp/prueba-local/${name}.log.`);
}
function mongoExecutable() {
  if (process.env.QUANTIC_MONGOD) return process.env.QUANTIC_MONGOD;
  const directory = path.join(process.env.ProgramFiles || 'C:/Program Files', 'MongoDB/Server');
  if (!fs.existsSync(directory)) throw new Error('Define QUANTIC_MONGOD con la ruta de mongod.exe.');
  const found = fs.readdirSync(directory).sort().reverse().map(v => path.join(directory, v, 'bin/mongod.exe')).find(p => fs.existsSync(p));
  if (!found) throw new Error('No se encontró mongod.exe.');
  return found;
}
async function main() {
  for (const port of [27018, 3000, 3001, 3002, 8001, 8002, 8003, 8004, 5173]) await assertFree(port);
  for (const component of ['server', 'servicio-de-mayoristas', 'notification-service', 'integration-esb', 'srv-servicios-adicionales', 'vite-project']) {
    const manifest = require(path.join(root, component, 'package.json'));
    const resolve = requireFor(component).resolve;
    for (const name of Object.keys(manifest.dependencies || {})) resolve(name);
    envFor(component);
  }
  const venvPython = path.join(root, 'audit-service/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  if (!fs.existsSync(venvPython)) throw new Error('Primero ejecuta node scripts/preparar-prueba.cjs.');
  const imports = spawnSync(venvPython, ['-c', 'import fastapi, uvicorn, pymongo, dotenv'], { stdio: 'ignore', windowsHide: true });
  if (imports.status !== 0) throw new Error('Faltan paquetes de Python. Ejecuta node scripts/preparar-prueba.cjs.');
  const mongod = mongoExecutable();
  fs.mkdirSync(path.join(work, 'mongo'), { recursive: true });

  // Solo se utiliza la configuración de MySQL indicada por el usuario, sin imprimirla.
  const mysql = requireFor('srv-servicios-adicionales')('mysql2/promise');
  const mysqlEnv = envFor('srv-servicios-adicionales');
  // Reuse this workspace's test database so restarting does not hide registered companies.
  const statePath = path.join(work, 'ultima-prueba.json');
  let previousDatabase;
  if (fs.existsSync(statePath)) {
    const previous = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (previous.mongoPort !== 27018 || !/^quantic_prueba_\d{13}$/.test(previous.mysqlDatabase || '')) throw new Error('La referencia a la base de prueba no es valida. Revisa tmp/prueba-local/ultima-prueba.json.');
    previousDatabase = previous.mysqlDatabase;
  }
  const testDatabase = previousDatabase || 'quantic_prueba_' + Date.now();
  let connection;
  try {
    connection = await mysql.createConnection({ host: mysqlEnv.DB_HOST || 'localhost', port: Number(mysqlEnv.DB_PORT || 3306), user: mysqlEnv.DB_USER || 'root', password: mysqlEnv.DB_PASSWORD || '', multipleStatements: true, connectTimeout: 5000 });
    if (previousDatabase) {
      await connection.query('USE `' + testDatabase + '`');
      await connection.query('SELECT id FROM empresas LIMIT 0');
      await connection.query('SELECT id FROM servicios LIMIT 0');
    } else {
      const schema = fs.readFileSync(path.join(root, 'srv-servicios-adicionales/database/schema.sql'), 'utf8').replaceAll('quantic_servicios_db', testDatabase);
      await connection.query(schema);
    }
  } catch (err) {
    const code = err.code || err.name;
    if (code === 'ER_ACCESS_DENIED_ERROR') {
      throw new Error(`MySQL rechazo las credenciales (${code}). Usuario: ${JSON.stringify(mysqlEnv.DB_USER || 'root')}; servidor: ${JSON.stringify(mysqlEnv.DB_HOST || 'localhost')}:${Number(mysqlEnv.DB_PORT || 3306)}; contrasena: ${mysqlEnv.DB_PASSWORD ? 'configurada' : 'vacia'}. Revisa que DB_USER y DB_PASSWORD en srv-servicios-adicionales/.env correspondan a la misma cuenta de MySQL. No se pudo validar el permiso CREATE.`);
    }
    if (!connection) {
      throw new Error(`No se pudo conectar a MySQL (${code}). Revisa DB_HOST, DB_PORT y que MySQL este disponible.`);
    }
    throw new Error(`MySQL acepto las credenciales, pero no pudo preparar la base de prueba (${code}). Revisa los permisos sobre ${testDatabase} y database/schema.sql.`);
  }
  finally { if (connection) await connection.end(); }
  fs.writeFileSync(path.join(work, 'ultima-prueba.json'), JSON.stringify({ fecha: new Date().toISOString(), mysqlDatabase: testDatabase, mongoPort: 27018 }, null, 2));
  console.log((previousDatabase ? 'Base MySQL de prueba conservada: ' : 'Base MySQL de prueba creada: ') + testDatabase);

  const mongoProcess = launch('mongodb', mongod, ['--dbpath', path.join(work, 'mongo'), '--replSet', 'quanticTest', '--port', '27018', '--bind_ip', '127.0.0.1', '--logpath', path.join(work, 'mongod.log'), '--logappend']);
  const { MongoClient } = requireFor('servicio-de-mayoristas')('mongoose').mongo;
  let client;
  for (let attempt = 0; attempt < 20; attempt++) {
    if (mongoProcess.exitCode !== null) throw new Error('MongoDB de prueba no arrancó. Revisa tmp/prueba-local/mongod.log.');
    client = new MongoClient('mongodb://127.0.0.1:27018/?directConnection=true', { serverSelectionTimeoutMS: 1000 });
    try { await client.connect(); break; } catch { await client.close(); client = null; await delay(500); }
  }
  if (!client) throw new Error('MongoDB de prueba no respondió.');
  try {
    let hello = await client.db('admin').command({ hello: 1 });
    if (!hello.setName) await client.db('admin').command({ replSetInitiate: { _id: 'quanticTest', members: [{ _id: 0, host: '127.0.0.1:27018' }] } });
    else if (hello.setName !== 'quanticTest') throw new Error('El replica set no pertenece a esta prueba.');
    for (let n = 0; n < 30; n++) { hello = await client.db('admin').command({ hello: 1 }); if (hello.isWritablePrimary) break; await delay(500); }
    if (!hello.isWritablePrimary) throw new Error('El replica set no eligió un primario.');
    const hasAdmin = await client.db('inventario_prueba').collection('users').findOne({ role: 'admin' });
    if (!hasAdmin) {
      console.log('\nCrea una cuenta de administrador exclusiva para esta prueba:');
      const result = spawnSync(process.execPath, ['scripts/create-admin.js'], { cwd: path.join(root, 'server'), env: { ...process.env, MONGODB_URI: 'mongodb://127.0.0.1:27018/inventario_prueba?replicaSet=quanticTest' }, stdio: 'inherit', windowsHide: true });
      if (result.status !== 0) throw new Error('No se pudo crear el administrador de prueba.');
    }
  } finally { await client.close(); }
  const mongo = database => `mongodb://127.0.0.1:27018/${database}?replicaSet=quanticTest`;
  const components = [
    ['auditoria', 'audit-service', venvPython, ['-m', 'uvicorn', 'app.main:create_app', '--factory', '--host', '127.0.0.1', '--port', '8001', '--no-access-log'], 8001, '/health/ready', { AUDIT_MONGODB_URI: mongo('quantic_audit_prueba'), AUDIT_DB_NAME: 'quantic_audit_prueba' }],
    ['notificaciones', 'notification-service', process.execPath, ['src/index.js'], 8002, '/health/ready', { MONGODB_URI: mongo('quantic_notifications_prueba'), MONGODB_DB: 'quantic_notifications_prueba', MAIL_MODE: 'console' }],
    ['adicionales', 'srv-servicios-adicionales', process.execPath, ['src/server.js'], 3002, '/api/v1/salud', { DB_NAME: testDatabase }],
    ['esb', 'integration-esb', process.execPath, ['src/index.js'], 8003, '/health/live', {}],
    ['mayoristas', 'servicio-de-mayoristas', process.execPath, ['index.js'], 3001, '/health/ready', { MONGODB_URI: mongo('mayoristas_prueba') }],
    ['reportes', 'reports-service', process.execPath, ['--env-file=.env', 'src/index.js'], 8004, '/health/ready', { REPORTS_DB_PATH: path.join(work, 'reports.sqlite') }],
    ['inventario', 'server', process.execPath, ['index.js'], 3000, '/api/health', { MONGODB_URI: mongo('inventario_prueba') }],
    ['frontend', 'vite-project', process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], 5173, '/', {}],
  ];
  for (const [name, directory, command, args, port, endpoint, env] of components) {
    const child = launch(name, command, args, { NODE_ENV: 'development', ...env }, path.join(root, directory));
    await ready(name, port, endpoint, child, name === 'adicionales');
  }
  console.log('\nComponentes respondiendo. Abre http://localhost:5173 e inicia sesión con tu administrador de prueba.');
  console.log('La prueba usa MongoDB :27018, SQLite y una base MySQL separadas. No se envían correos reales.');
  console.log('Esto verifica el arranque; todavía debes comprobar carga de Excel, confirmación, reportes y auditoría.');
  console.log('Mantén esta terminal abierta. Ctrl+C detiene solamente los procesos de esta prueba. Logs: tmp/prueba-local.');
}
main().catch(async err => { console.error('\nNo se completó el arranque: ' + err.message); await stop(); process.exitCode = 1; });
