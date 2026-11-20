import { randomUUID } from 'node:crypto';
import { enqueueAudit } from '../services/auditDelivery.js';

export function auditMiddleware(sink = enqueueAudit) {
  return (req, res, next) => {
    const requestId = randomUUID();
    const start = performance.now();
    const occurredAt = new Date().toISOString();
                                                                 
    const path = req.originalUrl.split('?')[0].split('#')[0].replace(/[\x00-\x1f\x7f]/g, '').slice(0, 1024) || '/';
    res.set('X-Request-ID', requestId);
    let sent = false;
    const record = () => {
      if (sent) return; sent = true;
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(req.method)) return;
      const event = { event_id: randomUUID(), occurred_at: occurredAt, actor_id: req.user?._id?.toString() || req.auditActorId || null,
        method: req.method, path, status_code: res.writableFinished ? res.statusCode : 499,
        duration_ms: Math.min(86400000, Math.max(0, Math.round(performance.now() - start))), request_id: requestId };
      Promise.resolve().then(() => sink(event)).catch(() => {
        console.error(JSON.stringify({ event: 'audit_enqueue_failed', eventId: event.event_id, requestId }));
      });
    };
    res.once('finish', record); res.once('close', record);
    next();
  };
}
export default auditMiddleware();
