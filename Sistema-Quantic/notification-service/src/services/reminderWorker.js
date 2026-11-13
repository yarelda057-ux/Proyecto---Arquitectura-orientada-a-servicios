import SupplierSchedule from '../models/supplierSchedule.js';
import { selectReminderMilestone } from './reminderPolicy.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_MS = 2 * 60 * 1000;
const LOCK_MS = 5 * 60 * 1000;
const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000;

export function startReminderWorker({ intervalMs, sendReminder }) {
  let running = false;
  async function processDueSchedules() {
    if (running) return;
    running = true;
    try {
      while (true) {
        const now = new Date();
        const threshold5 = new Date(now.getTime() + 5 * DAY_MS);
        const threshold3 = new Date(now.getTime() + 3 * DAY_MS);
        const threshold1 = new Date(now.getTime() + DAY_MS);
        const windowStart5 = new Date(threshold5.getTime() - WINDOW_MS);
        const windowStart3 = new Date(threshold3.getTime() - WINDOW_MS);
        const windowStart1 = new Date(threshold1.getTime() - WINDOW_MS);
        const schedule = await SupplierSchedule.findOneAndUpdate({
          active: true,
          nextAttemptAt: { $lte: now },
          lockedUntil: { $lte: now },
          $expr: { $ne: [{ $ifNull: ['$lastReminderFor', new Date(0)] }, '$nextDueAt'] },
          $or: [
            { nextDueAt: { $gte: windowStart5, $lte: threshold5 }, remindersSent: { $ne: 5 } },
            { nextDueAt: { $gte: windowStart3, $lte: threshold3 }, remindersSent: { $ne: 3 } },
            { nextDueAt: { $gte: windowStart1, $lte: threshold1 }, remindersSent: { $ne: 1 } },
          ],
        }, { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) } }, { sort: { nextDueAt: 1 }, new: true });
        if (!schedule) break;
        const daysBefore = selectReminderMilestone(schedule.nextDueAt, schedule.remindersSent, now);
        if (daysBefore === null) {
          await SupplierSchedule.updateOne({ _id: schedule._id, lockedUntil: schedule.lockedUntil }, { $set: { lockedUntil: new Date(0) } });
          continue;
        }
        const dueAt = schedule.nextDueAt;
        try {
          await sendReminder(schedule, { daysBefore });
          const update = { attempts: 0, nextAttemptAt: new Date(), lockedUntil: new Date(0) };
          if (daysBefore === 1) update.lastReminderFor = dueAt;
          await SupplierSchedule.updateOne({ _id: schedule._id, lockedUntil: schedule.lockedUntil }, { $addToSet: { remindersSent: daysBefore }, $set: update });
          console.info(JSON.stringify({ event: 'notification_sent', supplierId: schedule.supplierId, daysBefore, dueAt: dueAt.toISOString() }));
        } catch (error) {
          const attempts = schedule.attempts + 1;
          const delay = Math.min(30000 * (2 ** Math.min(attempts - 1, 10)), MAX_BACKOFF_MS);
          await SupplierSchedule.updateOne({ _id: schedule._id, lockedUntil: schedule.lockedUntil }, { $set: { attempts, nextAttemptAt: new Date(Date.now() + delay), lockedUntil: new Date(0) } });
          console.error(JSON.stringify({ event: 'notification_failed', supplierId: schedule.supplierId, daysBefore, attempt: attempts, error: error.name || 'MailError' }));
        }
      }
    } catch (error) {
      console.error(JSON.stringify({ event: 'notification_worker_failed', error: error.name || 'WorkerError' }));
    } finally { running = false; }
  }
  const timer = setInterval(processDueSchedules, intervalMs);
  timer.unref();
  void processDueSchedules();
  return () => clearInterval(timer);
}
