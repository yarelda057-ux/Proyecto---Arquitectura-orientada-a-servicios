                                                                                 
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { createInterface } = require('node:readline');

async function assertPortFree(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`Puerto ${port} ocupado o no disponible. Cierra la copia anterior del servicio.`)));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => server.close(resolve));
  });
}

function configuration(root) {
  const definitions = [
    ['audit-service', 8001, null, '/health/ready'],
    ['notification-service', 8002, 'src/index.js', '/health/ready'],
    ['srv-servicios-adicionales', 3002, 'src/server.js', '/api/v1/salud'],
    ['reports-service', 8004, 'src/index.js', '/health/ready'],
    ['integration-esb', 8003, 'src/index.js', '/health/live'],
    ['servicio-de-mayoristas', 3001, 'index.js', '/health/ready'],
    ['server', 3000, 'index.js', '/api/health'],
    ['vite-project', 5173, 'node_modules/vite/bin/vite.js', '/'],
  ];
  const localRequire = createRequire(path.join(root, 'server', 'package.json'));
  let parse;
  try { parse = localRequire('dotenv').parse; }
  catch { throw new Error('Faltan dependencias del backend. Ejecuta npm ci dentro de server.'); }
  return definitions.map(([name, defaultPort, entry, health]) => {
    const cwd = path.join(root, name);
    const envPath = path.join(cwd, '.env');
    if (!fs.existsSync(envPath)) throw new Error(`Falta ${name}/.env. Completa la primera instalacion del README.`);
                                                                         
    const env = { ...parse(fs.readFileSync(envPath)), ...process.env, PYTHONUNBUFFERED: '1' };
    const isPython = name === 'audit-service';
    const isVite = name === 'vite-project';
    const port = isPython || isVite ? defaultPort : Number(env.PORT || defaultPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Puerto invalido en ${name}.`);
    if (!isPython) {
      const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
      const deps = { ...pkg.dependencies, ...(isVite ? pkg.devDependencies : {}) };
      for (const dependency of Object.keys(deps)) {
        if (!fs.existsSync(path.join(cwd, 'node_modules', dependency))) throw new Error(`Falta ${dependency} en ${name}. Ejecuta npm ci dentro de esa carpeta.`);
      }
      if (!fs.existsSync(path.join(cwd, entry))) throw new Error(`Falta el archivo de inicio de ${name}.`);
    }
    const command = isPython ? path.join(cwd, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python') : process.execPath;
    if (isPython) {
      if (!fs.existsSync(command)) throw new Error('Falta audit-service/.venv. Crea el entorno Python e instala requirements.txt segun el README.');
      const check = spawnSync(command, ['-c', 'import uvicorn, fastapi, pymongo, dotenv, pydantic'], { cwd, env, windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (check.status !== 0) throw new Error('El entorno Python de auditoria no funciona o faltan dependencias. Revisa requirements.txt.');
    }
    const args = isPython ? ['-m', 'uvicorn', 'app.main:create_app', '--factory', '--host', '127.0.0.1', '--port', String(port), '--no-access-log'] : [entry];
    if (isVite) args.push('--host', 'localhost', '--port', String(port), '--strictPort');
    let host = isVite ? 'localhost' : (!isPython ? (env.HOST || '127.0.0.1') : '127.0.0.1');
    if (host === '0.0.0.0' || host === '::') host = '127.0.0.1';
    return { name, cwd, env, port, command, args, url: `http://${host}:${port}${health}`, mysql: name === 'srv-servicios-adicionales' };
  });
}

class Supervisor {
  constructor({ log = console.log, timeout = 45000, onFailure = () => {} } = {}) {
    this.children = []; this.stopping = false; this.log = log; this.timeout = timeout; this.onFailure = onFailure;
  }
  async start(services) {
    try {
      for (const service of services) {
        if (this.stopping) throw new Error('Inicio cancelado.');
        this.log(`[inicio] ${service.name}`);
        const child = spawn(service.command, service.args, { cwd: service.cwd, env: service.env, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
        this.children.push(child);
        let failed;
        child.once('error', () => { failed = new Error(`No se pudo iniciar ${service.name}.`); if (!this.stopping) this.onFailure(failed); });
        child.once('exit', (code) => {
          failed = new Error(`${service.name} se detuvo (codigo ${code}). Revisa sus mensajes.`);
          if (!this.stopping) this.onFailure(failed);
        });
        for (const stream of [child.stdout, child.stderr]) {
          createInterface({ input: stream }).on('line', line => this.log(`[${service.name}] ${line}`));
        }
        const until = Date.now() + this.timeout;
        let ready = false;
        while (Date.now() < until && !this.stopping) {
          if (failed) throw failed;
          try {
            const response = await fetch(service.url, { signal: AbortSignal.timeout(1500) });
            if (response.ok) {
              if (service.mysql) {
                const body = await response.json();
                if (body.base_de_datos?.estado !== 'CONECTADO') throw Object.assign(new Error('Servicios adicionales esta en modo memoria. Inicia MySQL y revisa su configuracion antes de continuar.'), { fatal: true });
              } else { await response.body?.cancel(); }
              ready = true; break;
            }
            await response.body?.cancel();
          } catch (error) { if (error.fatal) throw error; }
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        if (failed) throw failed;
        if (!ready || this.stopping) throw new Error(`${service.name} no esta listo. Comprueba MongoDB, MySQL y los mensajes anteriores.`);
        this.log(`[listo] ${service.name}`);
      }
    } catch (error) { await this.stop(); throw error; }
  }
  stop() {
    if (this.stopPromise) return this.stopPromise;
    this.stopping = true;
    this.stopPromise = Promise.all(this.children.map(child => new Promise(resolve => {
      if (!child.pid || child.exitCode !== null || child.signalCode !== null) return resolve();
      if (process.platform === 'win32') {
                                                                                 
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        const fallback = () => {
          if (child.exitCode !== null || child.signalCode !== null) return resolve();
          child.once('exit', resolve); child.kill();
        };
        killer.once('error', fallback);
        killer.once('exit', code => { if (code === 0) resolve(); else fallback(); });
      } else {
        child.once('exit', resolve); child.kill('SIGTERM');
        const timer = setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 3000); timer.unref();
      }
    })));
    return this.stopPromise;
  }
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const services = configuration(root);
  const seen = new Set();
  for (const service of services) {
    if (seen.has(service.port)) throw new Error(`Dos componentes usan el puerto ${service.port}. Revisa sus .env.`);
    seen.add(service.port); await assertPortFree(service.port);
  }
  console.log('Configuracion, dependencias y puertos comprobados.');
  if (process.argv.includes('--check')) {
    console.log('Verificacion sin iniciar servicios. No comprueba credenciales ni conexiones a bases de datos.'); return;
  }
  let finishing = false;
  const supervisor = new Supervisor({ onFailure: error => finish(1, error.message) });
  async function finish(code, message) {
    if (finishing) return;
    finishing = true;
    if (message) console.error(message);
    console.log('\nDeteniendo los componentes iniciados por este lanzador...');
    await supervisor.stop(); process.exit(code);
  }
  process.on('SIGINT', () => finish(0)); process.on('SIGTERM', () => finish(0));
  if (process.platform === 'win32') process.on('SIGBREAK', () => finish(0));
  await supervisor.start(services);
  if (!finishing) console.log('\nQUANTIC LISTO: http://localhost:5173\nManten esta terminal abierta. Ctrl+C detiene todos los componentes.');
}

if (require.main === module) main().catch(error => { console.error(`\n[error] ${error.message}`); process.exitCode = 1; });
module.exports = { Supervisor, assertPortFree, configuration };
