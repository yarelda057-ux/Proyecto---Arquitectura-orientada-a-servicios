import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { auditMiddleware } from '../Middleware/logsMiddleware.js';
import { deliverBatch } from '../services/auditDelivery.js';
import { auditConfig } from '../services/auditClient.js';

test('audit captures reads and writes once, verified identity and no credentials/query/body', async () => {
  const events = [];
  const app = express();
  app.use(auditMiddleware(event => events.push(event)));
  app.use(express.json());
  app.all('/resource', (req, res) => { req.user = { _id: 'verified-user' }; res.status(202).json({ ok: true }); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/resource?token=secret`, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret' }, ...(method !== 'GET' ? { body: '{"password":"secret"}' } : {}) });
      assert.ok(response.headers.get('x-request-id'));
      await response.text();
    }
    assert.equal(events.length, 5);
    assert.ok(events.every(event => event.actor_id === 'verified-user' && event.path === '/resource' && event.status_code === 202));
    assert.ok(events.every(event => event.duration_ms >= 0));
    assert.ok(!JSON.stringify(events).includes('secret'));
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
function fakeQueue() {
  const job = { _id: 'one', event: { event_id: 'one' }, attempts: 0 };
  const changes = { deleted: false, update: null };
  return { changes, Model: {
    findOneAndUpdate: () => ({ lean: async () => job }),
    deleteOne: async () => { changes.deleted = true; },
    updateOne: async (filter, update) => { changes.update = update; },
  } };
}
test('outbox acknowledges delivery only with a matching receipt', async () => {
  const queue = fakeQueue();
  await deliverBatch({ Model: queue.Model, limit: 1, send: async () => ({ ok: true, status: 201, json: async () => ({ id: 'mongo-id', event_id: 'one' }) }) });
  assert.equal(queue.changes.deleted, true);
  const bad = fakeQueue();
  await deliverBatch({ Model: bad.Model, limit: 1, send: async () => ({ ok: true, status: 200, json: async () => ({}) }) });
  assert.equal(bad.changes.deleted, false);
  assert.equal(bad.changes.update.$set.state, 'pending');
});
test('outbox retains timeouts for retry and quarantines permanent rejections', async () => {
  const queue = fakeQueue();
  await deliverBatch({ Model: queue.Model, limit: 1, send: async () => { throw new Error('offline'); } });
  assert.equal(queue.changes.deleted, false);
  assert.equal(queue.changes.update.$set.state, 'pending');
  assert.equal(queue.changes.update.$inc.attempts, 1);
  assert.ok(queue.changes.update.$set.nextAttemptAt > new Date());
  const rejected = fakeQueue();
  await deliverBatch({ Model: rejected.Model, limit: 1, send: async () => ({ ok: false, status: 403 }) });
  assert.equal(rejected.changes.update.$set.state, 'failed');
});
test('audit config rejects unsafe destinations before sending credentials', () => {
  const saved = { ...process.env };
  try {
    process.env.AUDIT_ENABLED = 'true';
    process.env.AUDIT_SERVICE_URL = 'http://remote.example';
    process.env.AUDIT_WRITE_KEY = 'w'.repeat(48); process.env.AUDIT_READ_KEY = 'r'.repeat(48);
    assert.throws(auditConfig);
    process.env.AUDIT_SERVICE_URL = 'http://127.0.0.1:8001';
    process.env.NODE_ENV = 'production'; assert.throws(auditConfig);
    process.env.NODE_ENV = 'test'; assert.ok(auditConfig());
  } finally { for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]; Object.assign(process.env, saved); }
});
