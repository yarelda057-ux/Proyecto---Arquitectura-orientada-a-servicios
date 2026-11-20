import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import soap from 'soap';

const args = process.argv.slice(2);
const preview = args.length === 1 && args[0] === '--console';
const recipient = args.length === 2 && args[0] === '--to' ? args[1] : '';
if (!preview && (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))) {
  console.log('Uso: node scripts/smtp-reminders-test.js --to "tu-correo@example.com"');
  console.log('Envía tres correos reales usando SMTP del .env. MongoDB debe estar activo.');
  console.log('Sin enviar correos: node scripts/smtp-reminders-test.js --console');
  process.exit(args.includes('--help') ? 0 : 1);
}

const serviceDir = fileURLToPath(new URL('../', import.meta.url));
const envPath = new URL('../.env', import.meta.url);
const settings = { ...(fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {}), ...process.env };
if (!preview && (!settings.SMTP_HOST || !settings.MAIL_FROM)) {
  throw new Error('Configura SMTP_HOST y MAIL_FROM en notification-service/.env.');
}
const dbName = `quantic_notifications_email_test_${Date.now()}_${randomBytes(6).toString('hex')}`;
const key = randomBytes(32).toString('hex');
const dayMs = 86400000;
const createdIds = new Set();
const sent = new Map();
let child;
let connected = false;
let interrupted = false;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
process.on('SIGINT', () => { interrupted = true; });
process.on('SIGTERM', () => { interrupted = true; });

async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  return port;
}

function checkRunning() {
  if (interrupted) throw new Error('Prueba interrumpida.');
  if (child && (child.exitCode !== null || child.signalCode !== null)) throw new Error('El servicio temporal terminó antes de completar la prueba.');
}

try {
  await mongoose.connect(settings.MONGODB_URI || 'mongodb://127.0.0.1:27017', { dbName, serverSelectionTimeoutMS: 5000 });
  connected = true;
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['src/index.js'], {
    cwd: serviceDir, windowsHide: true,
    env: {
      ...settings, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port), SOAP_PUBLIC_URL: baseUrl,
      MONGODB_DB: dbName, SOAP_CLIENT_KEYS_JSON: JSON.stringify({ emailtest: key }),
      MAIL_MODE: preview ? 'console' : 'smtp', WORKER_INTERVAL_MS: '5000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let startError;
  child.on('error', error => { startError = error.code || 'SPAWN_ERROR'; });
  let buffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      if (event.event === 'notification_sent' && createdIds.has(event.supplierId)) {
        sent.set(event.supplierId, (sent.get(event.supplierId) || 0) + 1);
        console.log(`Aviso de ${event.daysBefore} día(s): ${preview ? 'generado en consola' : 'aceptado por el servidor SMTP'}.`);
      }
    }
  });
                                                                                        
  child.stderr.on('data', () => {});
  const healthDeadline = Date.now() + 20000;
  let ready = false;
  while (Date.now() < healthDeadline) {
    if (startError) throw new Error(`No se pudo iniciar el proceso: ${startError}`);
    checkRunning();
    try { ready = (await fetch(`${baseUrl}/health/ready`, { signal: AbortSignal.timeout(1000) })).ok; } catch {                        }
    if (ready) break;
    await delay(250);
  }
  if (!ready) throw new Error('El servicio temporal no inició en 20 segundos.');
  const client = await soap.createClientAsync(`${baseUrl}/soap/notifications?wsdl`, { wsdl_options: { timeout: 10000 } });
  client.addHttpHeader('Authorization', `Bearer ${key}`);
  console.log(preview ? 'Prueba sin envío de correos.' : `Se enviarán tres correos de prueba a ${recipient}.`);
  for (const daysBefore of [5, 3, 1]) {
    checkRunning();
    const supplierId = `EMAIL-TEST-${randomBytes(6).toString('hex')}-${daysBefore}`;
    createdIds.add(supplierId);
    const [result] = await client.RegisterSupplierScheduleAsync({
      SupplierId: supplierId, SupplierName: `PRUEBA aviso de ${daysBefore} días`,
      ContactEmail: preview ? 'prueba@example.test' : recipient,
      UpdatePeriodDays: 30,
      LastCatalogUpdate: new Date(Date.now() - (30 - daysBefore) * dayMs).toISOString(),
      AdditionalMessage: 'Correo de prueba: las fechas son simuladas. No requiere subir un catálogo.',
      ConsumerSystem: 'emailtest',
    }, { timeout: 10000 });
    if (!result.Success) throw new Error(`No se pudo registrar el aviso de ${daysBefore} días: ${result.Code}`);
  }
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline && sent.size < 3) {
    checkRunning();
    await delay(500);
  }
  if (sent.size !== 3) throw new Error(`Solo se confirmaron ${sent.size} de 3 avisos en 90 segundos. Revisa la configuración SMTP; no repitas la prueba sin comprobar qué correos llegaron.`);
                                                                         
  await delay(6000);
  if ([...sent.values()].some(count => count !== 1)) throw new Error('Se detectó un aviso repetido durante la prueba.');
  console.log(preview ? 'OK: los tres avisos se generaron sin repetirse en el siguiente ciclo.' : 'OK: SMTP aceptó los tres avisos. Comprueba tu bandeja de entrada y spam; la aceptación SMTP no confirma la entrega.');
} catch (error) {
  console.error(`Prueba no completada: ${error.message?.startsWith('Solo se') || error.message?.startsWith('Se detectó') || error.message?.startsWith('El servicio') || error.message?.startsWith('Prueba interrumpida') ? error.message : (error.code || error.name || 'Error de conexión/configuración')}`);
  process.exitCode = 1;
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    const stopped = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await Promise.race([stopped, delay(5000)]);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await Promise.race([stopped, delay(3000)]);
    }
  }
  if (connected) {
    if (!/^quantic_notifications_email_test_\d+_[a-f0-9]{12}$/.test(dbName) || mongoose.connection.name !== dbName) throw new Error('Se rechazó la limpieza de una base ajena a esta prueba.');
    await mongoose.connection.dropDatabase();
    console.log('Base temporal de prueba eliminada.');
  }
  await mongoose.disconnect();
}
