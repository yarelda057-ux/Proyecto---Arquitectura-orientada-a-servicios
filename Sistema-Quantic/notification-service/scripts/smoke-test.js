import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import soap from 'soap';

const serviceDir = fileURLToPath(new URL('../', import.meta.url));
const mongoUri = process.env.SMOKE_MONGODB_URI || 'mongodb://127.0.0.1:27017';
const dbName = `quantic_notifications_smoke_${Date.now()}_${randomBytes(4).toString('hex')}`;
const inventoryKey = randomBytes(32).toString('hex');
const catalogKey = randomBytes(32).toString('hex');
const supplierId = `SMOKE-${randomBytes(5).toString('hex')}`;
let child;
let port;

function listenOnFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port: selectedPort } = probe.address();
      probe.close(error => error ? reject(error) : resolve(selectedPort));
    });
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForHealth(baseUrl, output) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`El servicio terminó antes de iniciar.\n${output()}`);
    try {
      const response = await fetch(`${baseUrl}/health/ready`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {                                          }
    await delay(250);
  }
  throw new Error(`El servicio no quedó listo en 15 segundos.\n${output()}`);
}

async function stopService() {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    delay(3000).then(() => { if (child.exitCode === null) child.kill('SIGKILL'); }),
  ]);
}

async function dropIsolatedDatabase() {
  if (!dbName.startsWith('quantic_notifications_smoke_')) throw new Error('Se rechazó borrar una base que no es de prueba.');
  await mongoose.connect(mongoUri, { dbName, serverSelectionTimeoutMS: 3000 });
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

try {
  await mongoose.connect(mongoUri, { dbName, serverSelectionTimeoutMS: 3000 });
  await mongoose.connection.db.admin().ping();
  await mongoose.disconnect();
} catch (error) {
  await mongoose.disconnect().catch(() => {});
  throw new Error(`MongoDB no está disponible en ${mongoUri}. Inicia MongoDB y vuelve a ejecutar la prueba.`, { cause: error });
}

try {
  port = await listenOnFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let output = '';
  child = spawn(process.execPath, ['src/index.js'], {
    cwd: serviceDir,
    windowsHide: true,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: String(port),
      SOAP_PUBLIC_URL: baseUrl,
      SOAP_CLIENT_KEYS_JSON: JSON.stringify({ inventory: inventoryKey, catalogos: catalogKey }),
      MONGODB_URI: mongoUri,
      MONGODB_DB: dbName,
      MAIL_MODE: 'console',
      WORKER_INTERVAL_MS: '5000',
    },
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });

  await waitForHealth(baseUrl, () => output);
  const wsdlUrl = `${baseUrl}/soap/notifications?wsdl`;
  const inventoryClient = await soap.createClientAsync(wsdlUrl);
  inventoryClient.addHttpHeader('Authorization', `Bearer ${inventoryKey}`);

  const registration = (await inventoryClient.RegisterSupplierScheduleAsync({
    SupplierId: supplierId,
    SupplierName: 'Proveedor de prueba',
    ContactEmail: 'notificaciones@example.test',
    UpdatePeriodDays: 30,
    LastCatalogUpdate: new Date().toISOString(),
    ConsumerSystem: 'inventory',
  }))[0];
  assert.equal(registration.Success, true, `RegisterSupplierSchedule: ${registration.Message}`);
  assert.equal(registration.Code, 'CREATED');

  const catalogClient = await soap.createClientAsync(wsdlUrl);
  catalogClient.addHttpHeader('Authorization', `Bearer ${catalogKey}`);
  const updatedAt = new Date(Date.now() + 1000).toISOString();
  const catalogUpdate = (await catalogClient.ReportCatalogUpdateAsync({
    SupplierId: supplierId,
    UpdatedAt: updatedAt,
    ConsumerSystem: 'catalogos',
  }))[0];
  assert.equal(catalogUpdate.Success, true, `ReportCatalogUpdate: ${catalogUpdate.Message}`);
  assert.equal(catalogUpdate.Code, 'UPDATED');

  const lookup = (await inventoryClient.GetSupplierScheduleAsync({
    SupplierId: supplierId,
    ConsumerSystem: 'inventory',
  }))[0];
  assert.equal(lookup.Success, true, `GetSupplierSchedule: ${lookup.Message}`);
  assert.equal(lookup.ContactEmail, 'notificaciones@example.test');
  assert.equal(lookup.Active, true);

  const wrongIdentity = (await inventoryClient.GetSupplierScheduleAsync({
    SupplierId: supplierId,
    ConsumerSystem: 'catalogos',
  }))[0];
  assert.equal(wrongIdentity.Success, false);
  assert.equal(wrongIdentity.Code, 'INVALID_ARGUMENT');

  const cancellationCall = await catalogClient.CancelSupplierScheduleAsync({
    SupplierId: supplierId,
    ConsumerSystem: 'catalogos',
  });
  const cancellation = cancellationCall[0];
  assert.ok(cancellation, `CancelSupplierSchedule devolvió una respuesta sin contenido: ${String(cancellationCall[1]).slice(0, 1000)}`);
  assert.equal(cancellation.Success, true, `CancelSupplierSchedule: ${cancellation.Message}`);

  const cancelled = (await catalogClient.GetSupplierScheduleAsync({
    SupplierId: supplierId,
    ConsumerSystem: 'catalogos',
  }))[0];
  assert.equal(cancelled.Active, false);

  const overdueSupplierId = `SMOKE-NEAR-DUE-${randomBytes(4).toString('hex')}`;
  const overdueLastUpdate = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000 - 90 * 1000).toISOString();
  const overdueRegistration = (await catalogClient.RegisterSupplierScheduleAsync({
    SupplierId: overdueSupplierId,
    SupplierName: 'Proveedor vencido de prueba',
    ContactEmail: 'recordatorio@example.test',
    UpdatePeriodDays: 30,
    LastCatalogUpdate: overdueLastUpdate,
    ConsumerSystem: 'catalogos',
  }))[0];
  assert.equal(overdueRegistration.Success, true);

  let reminderStatus;
  const reminderDeadline = Date.now() + 8000;
  while (Date.now() < reminderDeadline) {
    reminderStatus = (await catalogClient.GetSupplierScheduleAsync({
      SupplierId: overdueSupplierId,
      ConsumerSystem: 'catalogos',
    }))[0];
    if (reminderStatus.LastReminderFor) break;
    await delay(250);
  }
  assert.ok(reminderStatus?.LastReminderFor, 'El worker debe procesar el recordatorio vencido.');
  assert.ok(output.includes('notification_preview'), 'MAIL_MODE=console debe generar una vista previa del correo.');

  const unauthorized = await fetch(`${baseUrl}/soap/notifications`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: '"urn:quantic:notifications:v1#GetSupplierSchedule"',
      Authorization: 'Bearer invalid-token',
    },
    body: `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="urn:quantic:notifications:v1"><soap:Body><tns:GetSupplierScheduleRequest><tns:SupplierId>${supplierId}</tns:SupplierId><tns:ConsumerSystem>inventory</tns:ConsumerSystem></tns:GetSupplierScheduleRequest></soap:Body></soap:Envelope>`,
  });
  assert.equal(unauthorized.status, 401, 'El endpoint SOAP debe rechazar un token inválido con HTTP 401.');

  console.log('OK: WSDL, autenticación, programación, actualización, consulta, cancelación y worker de recordatorios SOAP.');
} finally {
  await stopService();
  await dropIsolatedDatabase();
}
