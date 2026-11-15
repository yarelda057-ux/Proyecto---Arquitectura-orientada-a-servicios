// Ejecutar en la terminal local: node scripts/preparar-prueba.cjs
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`Falló ${path.basename(command)}. Corrige el error mostrado y vuelve a ejecutar este script.`);
}
try {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 13)) throw new Error('Se necesita Node.js 22.13 o posterior.');
  const components = ['server', 'servicio-de-mayoristas', 'integration-esb', 'notification-service', 'srv-servicios-adicionales', 'vite-project'];
  for (const name of components) {
    console.log(`\nInstalando dependencias: ${name}`);
    const cwd = path.join(root, name);
    if (process.platform === 'win32') run('cmd.exe', ['/d', '/s', '/c', 'npm.cmd ci --no-audit --no-fund'], cwd);
    else run('npm', ['ci', '--no-audit', '--no-fund'], cwd);
  }
  const base = path.join(process.env.LOCALAPPDATA || '', 'Python');
  const candidates = process.platform === 'win32'
    ? (fs.existsSync(base) ? fs.readdirSync(base).filter(n => /^pythoncore-3\.(1[2-9]|[2-9][0-9])-64$/.test(n)).sort().reverse().map(n => path.join(base, n, 'python.exe')) : [])
    : ['python3'];
  if (process.env.QUANTIC_PYTHON) candidates.unshift(process.env.QUANTIC_PYTHON);
  const python = candidates.find(candidate => {
    const r = spawnSync(candidate, ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3,12) else 1)'], { stdio: 'ignore', windowsHide: true });
    return !r.error && r.status === 0;
  });
  if (!python) throw new Error('No se encontró Python >=3.12. Define QUANTIC_PYTHON con la ruta completa de python.exe.');
  const venv = path.join(root, 'audit-service/.venv');
  const venvPython = path.join(venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  if (!fs.existsSync(venvPython)) run(python, ['-m', 'venv', venv]);
  run(venvPython, ['-m', 'pip', 'install', '-r', 'requirements.txt', 'pytest', 'httpx'], path.join(root, 'audit-service'));
  const all = [...components, 'audit-service', 'reports-service'];
  const missing = all.filter(name => !fs.existsSync(path.join(root, name, '.env')));
  if (missing.length === all.length) run(process.execPath, ['scripts/configurar-local.cjs']);
  else if (missing.length) throw new Error('Faltan .env en: ' + missing.join(', ') + '. Se conservaron los que ya existen.');
  console.log('\nEjecutando pruebas sin bases de datos y compilando la interfaz...');
  for (const [directory, args] of [
    ['reports-service', ['--test', 'tests/*.test.js']],
    ['servicio-de-mayoristas', ['--test', 'tests/*.test.js']],
    ['notification-service', ['--test', 'src/services/*.test.js']],
    ['vite-project', ['node_modules/vite/bin/vite.js', 'build']],
  ]) run(process.execPath, args, path.join(root, directory));
  console.log('\nPreparación terminada. Configura DB_USER y DB_PASSWORD de MySQL en srv-servicios-adicionales/.env si corresponde.');
  console.log('Siguiente comando: node scripts/iniciar-prueba-local.cjs');
} catch (err) { console.error('\n' + err.message); process.exitCode = 1; }
