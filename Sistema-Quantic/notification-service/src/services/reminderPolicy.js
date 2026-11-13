const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_MS = 2 * 60 * 1000;
export const REMINDER_DAYS = Object.freeze([5, 3, 1]);

export function selectReminderMilestone(nextDueAt, remindersSent = [], now = new Date()) {
  const remaining = new Date(nextDueAt).getTime() - now.getTime();
  const sent = new Set((remindersSent || []).map(Number));
  for (const daysBefore of REMINDER_DAYS) {
    const lateBy = daysBefore * DAY_MS - remaining;
    if (!sent.has(daysBefore) && lateBy >= 0 && lateBy <= WINDOW_MS) return daysBefore;
  }
  return null;
}

export function reminderCopy(daysBefore) {
  if (daysBefore === 5) return { subject: 'Te quedan 5 días para subir tu catálogo', text: 'Te quedan 5 días para subir tu catálogo.' };
  if (daysBefore === 3) return { subject: 'Te quedan 3 días para subir tu catálogo', text: 'Te quedan 3 días para subir tu catálogo.' };
  if (daysBefore === 1) return { subject: 'Último día para subir tu catálogo', text: 'Hoy es el último día para subir tu catálogo.' };
  throw new RangeError('El recordatorio debe corresponder a 5, 3 o 1 día antes del vencimiento.');
}
