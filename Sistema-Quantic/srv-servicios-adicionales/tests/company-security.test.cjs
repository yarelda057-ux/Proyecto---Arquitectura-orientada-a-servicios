const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sign, verify, companyAccess, admin, authenticate } = require('../src/companySecurity');
const { capabilities } = require('../src/companyRegistry');
const key = 'company-test-key-'.repeat(4);
const claims = { sub: 'user-1', iss: 'inventory-gateway', aud: 'company-api', role: 'mayorista', ruc: '20601234561' };
const company = { ruc: claims.ruc, estado_verificacion: 'APROBADO', ofrece_servicios: true, provee_equipos: false };
test('signed portal identity; tampering, wrong audience and expiration rejected', () => {
  const token = sign(claims, key);
  assert.equal(verify(token, key).ruc, claims.ruc);
  assert.throws(() => verify(token, key + 'wrong'));
  assert.throws(() => verify(sign({ ...claims, aud: 'wholesale-api' }, key), key));
  assert.throws(() => verify(token, key, Math.floor(Date.now()/1000) + 61));
  assert.throws(() => verify(sign({ ...claims, iss: 'another-service' }, key), key));
});
test('integration identities cannot become portal administrators', () => {
  const token = sign({ ...claims, iss: 'wholesale-integration', role: 'integration' }, key);
  const identity = verify(token, key);
  let status;
  admin({ identity }, { status(value) { status = value; return this; }, json() {} }, () => assert.fail('Must deny admin access'));
  assert.equal(status, 403);
  assert.throws(() => verify(sign({ ...claims, iss: 'wholesale-integration', role: 'admin' }, key), key));
});
test('public requests cannot administer companies', () => {
  let status;
  authenticate({ get: () => undefined }, { status(value) { status = value; return this; }, json() {} }, () => assert.fail('Must authenticate'));
  assert.equal(status, 401);
});
test('service companies can publish their own offers, never another company', async () => {
  assert.equal(await companyAccess({ identity: claims }, company, { services: true }), company);
  await assert.rejects(companyAccess({ identity: { ...claims, ruc: '20602345672' } }, company), { status: 403 });
  await assert.rejects(companyAccess({ identity: { role: 'user' } }, company), { status: 403 });
});
test('equipment-only, suspended and pending companies cannot publish services', async () => {
  for (const change of [{ ofrece_servicios: false }, { estado_verificacion: 'INACTIVO' }, { estado_verificacion: 'PENDIENTE' }]) {
    await assert.rejects(companyAccess({ identity: claims }, { ...company, ...change }, { services: true }), { status: 403 });
  }
});
test('activities allow services, equipment or both, rejecting coercion and neither', () => {
  for (const [services, equipment] of [[true,false],[false,true],[true,true]]) assert.deepEqual(capabilities({ ofrece_servicios: services, provee_equipos: equipment }), { ofrece_servicios: services, provee_equipos: equipment });
  for (const value of [{}, { ofrece_servicios: false, provee_equipos: false }, { ofrece_servicios: 'false', provee_equipos: true }]) assert.throws(() => capabilities(value), { status: 400 });
});
