import test from 'node:test';
import assert from 'node:assert/strict';
import { requireInternalInventory } from '../routes/inventoryRoutes.js';

test('el inventario interno permite operadores y administradores pero rechaza mayoristas', () => {
  for (const role of ['user', 'admin', 'mayorista', 'unknown']) {
    let allowed = false;
    let status;
    const response = { status(value) { status = value; return this; }, json() {} };
    requireInternalInventory({ user: { role } }, response, () => { allowed = true; });
    assert.equal(allowed, ['user', 'admin'].includes(role));
    if (!allowed) assert.equal(status, 403);
  }
});
