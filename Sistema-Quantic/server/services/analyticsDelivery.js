import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';
import AnalyticsJob from '../models/analyticsJob.js';
import { sendAuditEvent } from './auditClient.js';

const stableUuid = input => {
  const h = createHash('sha256').update(input).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
export function analyticsCredentials() {
  const wholesaleKey = process.env.WHOLESALE_INTEGRATION_KEY || '', reportsKey = process.env.REPORTS_INTEGRATION_KEY || '', esbKey = process.env.INTEGRATION_ESB_KEY || '';
  if ([wholesaleKey, reportsKey, esbKey].some(key => key.length < 32)) throw new Error('Integracion analitica sin configurar.');
  return {
    stock: jwt.sign({ role: 'admin', purpose: 'analytics-source' }, wholesaleKey, { subject: '000000000000000000000004', issuer: 'inventory-gateway', audience: 'wholesale-api', expiresIn: 60 }),
    reports: jwt.sign({ scopes: ['reports:read', 'reports:write'] }, reportsKey, { subject: 'inventory-analytics-worker', issuer: 'inventory-gateway', audience: 'reports-api', expiresIn: 60 }),
    esbKey,
  };
}
export async function analyticsRequest(path, { method = 'GET', body, correlationId = randomUUID(), fetchImpl = fetch } = {}) {
  const base = new URL(process.env.INTEGRATION_ESB_URL || 'http://127.0.0.1:8003');
  if (base.username || base.password || (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname) && process.env.NODE_ENV !== 'production'))) throw new Error('URL de integracion no valida.');
  const c = analyticsCredentials();
  const response = await fetchImpl(new URL(path, base), {
    method, redirect: 'error', signal: AbortSignal.timeout(5000),
    headers: { 'X-ESB-Key': c.esbKey, Authorization: 'Bearer ' + (path.startsWith('/v1/inventory-events') ? c.stock : c.reports), 'X-Stock-Authorization': 'Bearer ' + c.stock, 'X-Correlation-ID': correlationId, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw Object.assign(new Error('La etapa analitica no esta disponible.'), { status: response.status });
  return response.json();
}

export async function discoverAnalyticsJobs({ Model = AnalyticsJob, request = analyticsRequest } = {}) {
  const latest = await Model.findOne({}).sort({ sequence: -1 }).lean();
  const data = await request('/v1/inventory-events?despues=' + (latest?.sequence || 0));
  if (!Array.isArray(data.eventos)) throw new Error('Eventos de inventario invalidos.');
  let last = latest?.sequence || 0;
  for (const event of data.eventos) {
    if (!Number.isSafeInteger(event.secuencia) || event.secuencia <= last || event.versionInventario !== `INV-${String(event.secuencia).padStart(6, '0')}`) throw new Error('Secuencia de eventos invalida.');
    last = event.secuencia;
    const auditId = stableUuid('analytics:' + event.versionInventario);
    const correlationId = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(event.idOperacion || '') ? event.idOperacion : stableUuid('operation:' + event.versionInventario);
    await Model.updateOne({ _id: event.versionInventario }, { $setOnInsert: { sequence: event.secuencia, actorId: event.actorId, batchId: event.idLote, operationId: event.idOperacion, auditId, correlationId } }, { upsert: true });
  }
  return data.eventos.length;
}

export async function deliverAnalyticsJob({ Model = AnalyticsJob, request = analyticsRequest, audit = sendAuditEvent, now = () => new Date() } = {}) {
  const leaseToken = randomUUID();
  const job = await Model.findOneAndUpdate({ state: 'pending', nextAttemptAt: { $lte: now() }, lockedUntil: { $lte: now() } }, { $set: { leaseToken, lockedUntil: new Date(now().getTime() + 60000) } }, { sort: { sequence: 1 }, new: true }).lean();
  if (!job) return false;
  const filter = { _id: job._id, leaseToken };
  try {
    if (!job.dashboardDone) {
      const receipt = await request('/v1/reports/actualizaciones', { method: 'POST', correlationId: job.correlationId, body: { idOperacion: job.auditId, versionInventario: job._id } });
      if (receipt.idOperacion !== job.auditId || receipt.versionInventario !== job._id || !Array.isArray(receipt.dashboards)) throw new Error('Acuse de dashboard invalido.');
      await Model.updateOne(filter, { $set: { dashboardDone: true, dashboardReceipt: receipt, attempts: 0 } });
      job.attempts = 0;
    }
    if (!job.auditDone) {
      // Persist the exact event before delivery: retries preserve its UUID and timestamp.
      const event = job.auditEvent || { event_id: job.auditId, request_id: job.correlationId, actor_id: job.actorId || 'inventory-analytics-worker', occurred_at: now().toISOString(), method: 'POST', path: '/api/v1/inventario/actualizaciones', status_code: 200, duration_ms: 0, context: { operation: 'INVENTORY_ANALYTICS', inventory_version: job._id } };
      if (!job.auditEvent) await Model.updateOne(filter, { $set: { auditEvent: event } });
      const response = await audit(event);
      const receipt = response.ok ? await response.json() : null;
      if (!receipt || receipt.event_id !== event.event_id || typeof receipt.id !== 'string') throw Object.assign(new Error('Auditoria sin acuse de recepcion.'), { status: response.status });
      await Model.updateOne(filter, { $set: { auditDone: true } });
    }
    await Model.updateOne(filter, { $set: { state: 'complete', completedAt: now(), lockedUntil: new Date(0), lastError: '' } });
  } catch (err) {
    const attempts = job.attempts + 1;
    const permanent = err.status >= 400 && err.status < 500 && ![408, 429].includes(err.status);
    await Model.updateOne(filter, { $set: { attempts, state: permanent || attempts >= 4 ? 'failed' : 'pending', nextAttemptAt: new Date(now().getTime() + 1000 * 2 ** (attempts - 1)), lockedUntil: new Date(0), lastError: 'Etapa pendiente; revisa la disponibilidad y configuracion de reportes o auditoria.' } });
  }
  return true;
}

export function startAnalyticsWorker() {
  let running = null;
  let lastDiscovery = 0;
  const tick = () => {
    if (running) return;
    running = (async () => {
      if (Date.now() - lastDiscovery >= 5000) {
        try { await discoverAnalyticsJobs(); lastDiscovery = Date.now(); }
        catch { console.error('No se pudieron consultar los eventos de inventario para reportes.'); lastDiscovery = Date.now(); }
      }
      await deliverAnalyticsJob();
    })().catch(() => console.error('Actualizacion analitica pendiente de recuperacion.')).finally(() => { running = null; });
  };
  const timer = setInterval(tick, 1000); timer.unref(); tick();
  return async () => { clearInterval(timer); if (running) await running; };
}
