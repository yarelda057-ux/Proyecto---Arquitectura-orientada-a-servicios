import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoapClient } from './soapClient.js';

test('traduce una respuesta SOAP correcta a JSON y conserva el ID de correlación', async () => {
  let request;
  const client = createSoapClient({ url: 'http://soap.test/soap', key: 's'.repeat(40), timeoutMs: 500, consumerSystem: 'esb', fetchImpl: async (url, options) => { request = { url, options }; return new Response('<Envelope><Body><RegisterSupplierScheduleResponse><Success>true</Success><Code>CREATED</Code><Message>Programación guardada.</Message><NextDueAt>2026-12-01T00:00:00.000Z</NextDueAt></RegisterSupplierScheduleResponse></Body></Envelope>', { status: 200 }); } });
  const response = await client('RegisterSupplierSchedule', { SupplierId: 'MAY-ABC123', SupplierName: 'Proveedor & Uno', UpdatePeriodDays: 30 }, 'corr-123');
  assert.equal(response.Success, true);
  assert.equal(response.Code, 'CREATED');
  assert.equal(response.NextDueAt, '2026-12-01T00:00:00.000Z');
  assert.match(request.options.body, /Proveedor &amp; Uno/);
  assert.equal(request.options.headers['X-Correlation-ID'], 'corr-123');
  assert.equal(request.options.headers.Authorization, `Bearer ${'s'.repeat(40)}`);
});

test('convierte respuesta inválida en error de proveedor', async () => {
  const client = createSoapClient({ url: 'http://soap.test', key: 's'.repeat(40), timeoutMs: 500, fetchImpl: async () => new Response('<Envelope><Fault>Invalid</Fault></Envelope>', { status: 200 }) });
  await assert.rejects(client('GetSupplierSchedule', { SupplierId: 'MAY-ABC123' }, 'corr-2'), { status: 502 });
});

test('reporta timeout SOAP como 504', async () => {
  const client = createSoapClient({ url: 'http://soap.test', key: 's'.repeat(40), timeoutMs: 5, fetchImpl: (_url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))) });
  await assert.rejects(client('GetSupplierSchedule', { SupplierId: 'MAY-ABC123' }, 'corr-3'), { status: 504 });
});
