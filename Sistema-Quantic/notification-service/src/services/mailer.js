import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { reminderCopy } from './reminderPolicy.js';

const transport = config.mailMode === 'smtp'
  ? nodemailer.createTransport({ host: config.smtpHost, port: config.smtpPort, secure: config.smtpSecure, auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPassword } : undefined })
  : null;

export async function sendCatalogReminder(schedule, { daysBefore = 1 } = {}) {
  const copy = reminderCopy(daysBefore);
  const dueDate = schedule.nextDueAt.toLocaleDateString('es-PE', { timeZone: 'America/Lima' });
  const message = {
    from: config.mailFrom,
    to: schedule.contactEmail,
    subject: copy.subject,
    text: 'Hola ' + schedule.supplierName + ',\n\n' + copy.text + '\n\nLa fecha límite es ' + dueDate + '.'
      + (schedule.additionalMessage?.trim() ? '\n\nInformación adicional:\n' + schedule.additionalMessage.trim() : '')
      + '\n\nEste mensaje fue generado automáticamente.',
  };
  if (config.mailMode === 'console') {
    const [name, domain] = schedule.contactEmail.split('@');
    console.info(JSON.stringify({ event: 'notification_preview', supplierId: schedule.supplierId, to: name.slice(0, 1) + '***@' + domain, daysBefore, subject: copy.subject, dueAt: schedule.nextDueAt.toISOString() }));
    return;
  }
  await transport.sendMail(message);
}
