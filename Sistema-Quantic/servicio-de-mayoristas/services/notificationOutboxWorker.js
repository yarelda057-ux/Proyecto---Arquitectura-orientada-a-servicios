import Supplier from '../models/supplier.js';
import NotificationOutbox from '../models/notificationOutbox.js';
import { sendNotificationEvent } from './notificationIntegration.js';
const retryDelay = attempts => Math.min(3600000, 5000 * (2 ** Math.min(attempts, 9)));
export async function enqueueNotification(eventId, eventType, supplierId, extra = {}) {
  await NotificationOutbox.updateOne({ eventId }, { $setOnInsert: { eventId, eventType, supplierId, ...extra, status: 'pending', attempts: 0, nextAttemptAt: new Date() } }, { upsert: true });
}
export async function reconcileNotificationSchedules() {
  const active = await Supplier.find({ activo: true, notificationsEnabled: { $ne: false }, notificationSyncStatus: { $ne: 'synced' } }).select('supplierId notificationRevision').limit(100).lean();
  for (const supplier of active) await enqueueNotification('schedule:' + supplier.supplierId + ':' + (supplier.notificationRevision || 1), 'sync-schedule', supplier.supplierId);
  const cancel = await Supplier.find({ $or: [{ activo: false, notificationCancelPending: true }, { notificationsEnabled: false, notificationCancelPending: true }] }).select('supplierId notificationRevision').limit(100).lean();
  for (const supplier of cancel) await enqueueNotification('cancel:' + supplier.supplierId + ':' + (supplier.notificationRevision || 1), 'cancel-schedule', supplier.supplierId);
}
let busy = false;
export async function processNotificationOutbox() {
  if (busy) return; busy = true;
  try {
    const now = new Date();
    await NotificationOutbox.updateMany({ status: 'processing', updatedAt: { $lt: new Date(Date.now() - 60000) } }, { $set: { status: 'pending', nextAttemptAt: now } });
    const job = await NotificationOutbox.findOneAndUpdate({ status: 'pending', nextAttemptAt: { $lte: now } }, { $set: { status: 'processing' } }, { sort: { createdAt: 1 }, new: true });
    if (!job) return;
    const supplier = await Supplier.findOne({ supplierId: job.supplierId });
    if (!supplier) { job.status = 'failed'; job.lastError = 'Proveedor ya no existe.'; await job.save(); return; }
    if (job.eventType === 'cancel-schedule' && supplier.activo && supplier.notificationsEnabled !== false) { job.status = 'sent'; job.lastError = 'Omitido: solicitud de cancelación superada por una reactivación.'; await job.save(); return; }
    if ((job.eventType === 'sync-schedule' || job.eventType === 'catalog-updated') && (!supplier.activo || supplier.notificationsEnabled === false)) {
      job.status = 'sent'; job.lastError = 'Omitido: notificaciones desactivadas o proveedor inactivo.'; await job.save(); return;
    }
    if (job.eventType === 'catalog-updated' && supplier.notificationSyncStatus !== 'synced') { job.status = 'pending'; job.nextAttemptAt = new Date(Date.now() + 5000); await job.save(); return; }
    try {
      await sendNotificationEvent(job, supplier);
      job.status = 'sent'; job.sentAt = new Date(); job.lastError = undefined; await job.save();
      if (job.eventType === 'sync-schedule') { supplier.notificationSyncStatus = 'synced'; supplier.notificationCancelPending = false; await supplier.save(); }
      if (job.eventType === 'cancel-schedule') { supplier.notificationCancelPending = false; supplier.notificationSyncStatus = 'synced'; await supplier.save(); }
    } catch (err) {
      job.attempts += 1; job.lastError = String(err.message).slice(0, 500); job.status = err.permanent ? 'failed' : 'pending'; job.nextAttemptAt = new Date(Date.now() + retryDelay(job.attempts)); await job.save();
      if (job.eventType === 'sync-schedule' || job.eventType === 'cancel-schedule') { supplier.notificationSyncStatus = 'pending'; await supplier.save(); }
      console.error('Error al sincronizar notificación', { eventId: job.eventId, attempt: job.attempts, permanent: Boolean(err.permanent), message: job.lastError });
    }
  } finally { busy = false; }
}
export function startNotificationOutboxWorker({ intervalMs = 5000 } = {}) {
  let stopped = false; const tick = async () => { if (stopped) return; try { await reconcileNotificationSchedules(); await processNotificationOutbox(); } catch (err) { console.error('Worker de notificaciones no disponible:', err.message); } };
  void tick(); const timer = setInterval(() => void tick(), intervalMs); timer.unref?.(); return () => { stopped = true; clearInterval(timer); };
}
