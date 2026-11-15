import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { companyByRuc, assertCompany } from '../services/companyRegistry.js';
const key = 'registry-permissions-test-key-'.repeat(3);
process.env.COMPANY_INTEGRATION_KEY = key;
process.env.COMPANY_SERVICE_URL = 'http://127.0.0.1:3002';
const company = { ruc: '20601234561', estado_verificacion: 'APROBADO', ofrece_servicios: true, provee_equipos: true };
test('stock registry sends bounded, audience-specific integration token and verifies the RUC', async () => {
  const result = await companyByRuc(company.ruc, async (url, options) => {
    assert.equal(url.pathname, '/api/v1/integracion/empresas/ruc/' + company.ruc);
    const token = jwt.verify(options.headers.Authorization.slice(7), key, { algorithms: ['HS256'], audience: 'company-api', issuer: 'wholesale-integration' });
    assert.equal(token.role, 'integration'); assert.equal(token.exp - token.iat, 60);
    assert.equal(options.redirect, 'error');
    return { ok: true, json: async () => ({ empresa: company }) };
  });
  assert.deepEqual(result, company);
});
test('services-only cannot upload stock; approved equipment and mixed companies can', () => {
  assert.throws(() => assertCompany({ ...company, provee_equipos: false }, true), { status: 403 });
  assert.equal(assertCompany(company, true), company);
  assert.doesNotThrow(() => assertCompany({ ...company, ofrece_servicios: false }, true));
});
test('revoked and pending companies are rejected despite prior permissions', () => {
  for (const estado_verificacion of ['PENDIENTE','INACTIVO','RECHAZADO']) assert.throws(() => assertCompany({ ...company, estado_verificacion }, true), { status: 403 });
});
test('outage, absent registry and invalid responses fail closed', async () => {
  await assert.rejects(companyByRuc(company.ruc, async () => { throw Error('offline'); }), { status: 503 });
  await assert.rejects(companyByRuc(company.ruc, async () => ({ ok: false, status: 404 })), { status: 403 });
  await assert.rejects(companyByRuc(company.ruc, async () => ({ ok: false, status: 503 })), { status: 503 });
  await assert.rejects(companyByRuc(company.ruc, async () => ({ ok: true, json: async () => ({ empresa: { ...company, ruc: '20602345672' } }) })), { status: 503 });
  await assert.rejects(companyByRuc(company.ruc, async () => ({ ok: true, json: async () => ({ empresa: { ...company, provee_equipos: 'true' } }) })), { status: 503 });
  await assert.rejects(companyByRuc(''), { status: 403 });
});
