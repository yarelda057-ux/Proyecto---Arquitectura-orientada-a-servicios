import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import request from './http-memory.cjs';
import Supplier from '../models/supplier.js';
import StockBatch from '../models/stockBatch.js';
import SupplierStock from '../models/supplierStock.js';
import User from '../models/user.js';
import Session from '../models/session.js';
import { createApp } from '../app.js';
const key = 'company-write-route-test-'.repeat(3);
process.env.JWT_SECRET = 'other-test-secret-'.repeat(4);
process.env.INTEGRATION_KEY = key;
process.env.COMPANY_INTEGRATION_KEY = key;
process.env.COMPANY_SERVICE_URL = 'http://127.0.0.1:3002';
const app = createApp();
const token = jwt.sign({ role: 'admin' }, key, { algorithm: 'HS256', subject: '0123456789abcdef01234567', issuer: 'inventory-gateway', audience: 'wholesale-api', expiresIn: 60 });
test('direct stock API rejects upload, prior batch confirmation and manual adjustment for services-only companies', async t => {
  const supplier = { supplierId: 'MAY-TEST1234', ruc: '20601234561', activo: true };
  t.mock.method(Supplier, 'findOne', async () => supplier);
  t.mock.method(StockBatch, 'findOne', async () => ({ batchId: 'LOTE-TEST', supplierId: supplier.supplierId, estado: 'VALIDADO' }));
  t.mock.method(SupplierStock, 'findById', () => ({ lean: async () => ({ supplierId: supplier.supplierId }) }));
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ empresa: { ruc: supplier.ruc, estado_verificacion: 'APROBADO', provee_equipos: false, ofrece_servicios: true } }) }));
  const routes = [
    { method: 'POST', url: '/api/v1/stock/upload', body: { idMayorista: supplier.supplierId, formato: 'XLSX', archivoBase64: Buffer.from([0x50,0x4b,0,0]).toString('base64') } },
    { method: 'POST', url: '/api/v1/stock/lotes/LOTE-TEST/confirmacion', body: {} },
    { method: 'PUT', url: '/api/v1/stock/products/0123456789abcdef01234567', body: {} },
  ];
  for (const route of routes) {
    const response = await request(app, { ...route, token, headers: { 'idempotency-key': 'company-test' } });
    assert.equal(response.status, 403, route.url + ' ' + JSON.stringify(response));
  }
});
test('old duplicate registration and account routes are disabled', async () => {
  for (const route of [
    { method: 'POST', url: '/api/v1/stock/proveedores' },
    { method: 'POST', url: '/api/v1/stock/proveedores/MAY-TEST1234/usuarios' },
    { method: 'PUT', url: '/api/v1/stock/proveedores/MAY-TEST1234/usuarios/0123456789abcdef01234567/password' },
  ]) assert.equal((await request(app, { ...route, token, body: {} })).status, 410);
});
test('provisioning a services-only company reuses its previous supplier ID and account ownership', async t => {
  const supplier = { supplierId: 'MAY-OLD12345', ruc: '20601234561', nombre: 'Anterior', async save() {} };
  t.mock.method(Supplier, 'find', () => ({ limit: async () => [supplier] }));
  t.mock.method(User, 'findOne', () => ({ select: async () => null }));
  t.mock.method(User, 'exists', async () => null);
  let created;
  t.mock.method(User, 'create', async value => { created = value; return value; });
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ empresa: { ruc: supplier.ruc, razon_social: 'Empresa comun', email_contacto: 'contacto@example.test', estado_verificacion: 'APROBADO', provee_equipos: false, ofrece_servicios: true } }) }));
  const response = await request(app, { method: 'POST', url: '/api/v1/stock/empresas/' + supplier.ruc + '/acceso', token, body: { accion: 'crear', email: 'empresa@example.test', password: 'fixture-only-password-123' } });
  assert.equal(response.status, 200);
  assert.equal(response.body.proveedor.idMayorista, 'MAY-OLD12345');
  assert.equal(created.supplierId, 'MAY-OLD12345');
  assert.equal(supplier.companyRuc, supplier.ruc);
  assert.equal(supplier.nombre, 'Empresa comun');
});
test('password reset cannot change a different company account', async t => {
  const supplier = { supplierId: 'MAY-OLD12345', ruc: '20601234561', async save() {} };
  t.mock.method(Supplier, 'find', () => ({ limit: async () => [supplier] }));
  t.mock.method(User, 'findOne', () => ({ select: async () => ({ email: 'owner@example.test', save() { assert.fail('Must not reset'); } }) }));
  t.mock.method(Session, 'deleteMany', () => assert.fail('Must not revoke unrelated sessions'));
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ empresa: { ruc: supplier.ruc, razon_social: 'Empresa', email_contacto: 'owner@example.test', estado_verificacion: 'APROBADO', provee_equipos: true, ofrece_servicios: true } }) }));
  const response = await request(app, { method: 'POST', url: '/api/v1/stock/empresas/' + supplier.ruc + '/acceso', token, body: { accion: 'password', email: 'another@example.test', password: 'fixture-only-password-123' } });
  assert.equal(response.status, 404);
});
