import { randomUUID } from 'node:crypto';
import AuditOutbox from '../models/auditOutbox.js';
import { auditConfig, sendAuditEvent } from './auditClient.js';

export async function enqueueAudit(event) {
  if (process.env.AUDIT_ENABLED !== 'true') return;
  await AuditOutbox.create({ _id: event.event_id, event });
}
export async function deliverBatch({ Model = AuditOutbox, send = sendAuditEvent, limit = 25 } = {}) {
  let processed = 0;
  while (processed < limit) {
    const now = new Date();
    const leaseToken = randomUUID();
    const job = await Model.findOneAndUpdate({ state: 'pending', nextAttemptAt: { $lte: now }, lockedUntil: { $lte: now } },
      { $set: { lockedUntil: new Date(Date.now() + 60000), leaseToken } }, { new: true, sort: { nextAttemptAt: 1 } }).lean();
    if (!job) break;
    let status = 0;
    try {
      const response = await send(job.event);
      status = response.status;
                                                                             
      if (response.ok) {
        const receipt = await response.json();
        if (receipt.event_id === job.event.event_id && typeof receipt.id === 'string') {
          await Model.deleteOne({ _id: job._id, leaseToken });
          processed++; continue;
        }
        status = 0;
      }
    } catch {                                                    }
    const permanent = status >= 400 && status < 500 && ![408, 429].includes(status);
    await Model.updateOne({ _id: job._id, leaseToken }, { $inc: { attempts: 1 }, $set: {
      state: permanent ? 'failed' : 'pending', lastStatus: status,
      lockedUntil: new Date(0), nextAttemptAt: new Date(Date.now() + Math.min(300000, 1000 * 2 ** Math.min(job.attempts, 8)) + Math.floor(Math.random() * 500)),
    } });
    if (permanent) console.error(JSON.stringify({ event: 'audit_delivery_rejected', eventId: job._id, status }));
    processed++;
  }
  return processed;
}
export function startAuditWorker() {
  const config = auditConfig();
  if (!config) { console.warn('Auditoría remota desactivada: AUDIT_ENABLED no es true.'); return async () => {}; }
  let running = null;
  const tick = () => {
    if (!running) running = deliverBatch({ send: event => sendAuditEvent(event, config) })
      .catch(() => console.error(JSON.stringify({ event: 'audit_worker_unavailable' })))
      .finally(() => { running = null; });
  };
  const timer = setInterval(tick, 2000); timer.unref(); tick();
  return async () => { clearInterval(timer); if (running) await running; };
}
