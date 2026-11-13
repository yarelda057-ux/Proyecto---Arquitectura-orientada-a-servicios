import SupplierSchedule from '../models/supplierSchedule.js';

const DAY_MS = 24 * 60 * 60 * 1000;
function reminderDates(nextDueAt) { return { ReminderAt: addDays(nextDueAt, -5).toISOString(), ReminderAt3Days: addDays(nextDueAt, -3).toISOString(), ReminderAtLastDay: addDays(nextDueAt, -1).toISOString() }; }
const validSupplierId = value => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 100;
const validName = value => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 160;
const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validSystem = value => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 100;
const validDate = value => value instanceof Date
  ? !Number.isNaN(value.getTime())
  : typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
    && !Number.isNaN(Date.parse(value));
const validPeriod = value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 3650;

function validateScheduleInput(args, { registration = false, req } = {}) {
  const errors = [];
  if (!validSupplierId(args.SupplierId)) errors.push('SupplierId es obligatorio y admite hasta 100 caracteres.');
  if (!validSystem(args.ConsumerSystem) || args.ConsumerSystem.trim() !== req?.consumerSystem) errors.push('ConsumerSystem debe coincidir con la identidad del sistema autenticado.');
  if (registration && !validName(args.SupplierName)) errors.push('SupplierName es obligatorio y admite hasta 160 caracteres.');
  if (registration && !validEmail(args.ContactEmail)) errors.push('ContactEmail debe tener formato de correo válido.');
  if (registration && !validPeriod(args.UpdatePeriodDays)) errors.push('UpdatePeriodDays debe ser un entero entre 1 y 3650.');
  if (registration && !validDate(args.LastCatalogUpdate)) errors.push('LastCatalogUpdate debe ser una fecha ISO 8601 válida con zona horaria.');
  if (registration && args.AdditionalMessage != null && (typeof args.AdditionalMessage !== 'string' || args.AdditionalMessage.trim().length > 500 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(args.AdditionalMessage))) errors.push('AdditionalMessage admite texto plano de hasta 500 caracteres.');
  return errors;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function response(ok, code, message, fields = {}) {
  return { Success: ok, Code: code, Message: message, ...fields };
}

export function createScheduleOperations() {
  return {
    RegisterSupplierSchedule: async (args, _callback, _headers, req) => {
      const errors = validateScheduleInput(args, { registration: true, req });
      if (errors.length) return response(false, 'INVALID_ARGUMENT', errors.join(' '));

      const lastUpdate = new Date(args.LastCatalogUpdate);
      const periodDays = Number(args.UpdatePeriodDays);
      const nextDueAt = addDays(lastUpdate, periodDays);

      const supplierId = args.SupplierId.trim();
      const existing = await SupplierSchedule.findOne({ supplierId });
      const sameCycle = existing && existing.nextDueAt.getTime() === nextDueAt.getTime();
      const update = {
        supplierName: args.SupplierName.trim(),
        contactEmail: args.ContactEmail.trim().toLowerCase(),
        additionalMessage: typeof args.AdditionalMessage === 'string' ? args.AdditionalMessage.trim() : '',
        updatePeriodDays: periodDays,
        lastCatalogUpdate: lastUpdate,
        nextDueAt,
        active: true,
        updatedBySystem: args.ConsumerSystem.trim(),
        remindersSent: existing?.lastReminderFor?.getTime() === nextDueAt.getTime() ? [5, 3, 1] : (existing?.remindersSent || []),
      };
      if (!sameCycle) {
        Object.assign(update, {
          lastReminderFor: null,
          remindersSent: existing?.lastReminderFor?.getTime() === nextDueAt.getTime() ? [5, 3, 1] : [],
          attempts: 0,
          nextAttemptAt: new Date(),
          lockedUntil: new Date(0),
        });
      }
      const schedule = await SupplierSchedule.findOneAndUpdate(
        { supplierId },
        { $set: update },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
      );

      return response(true, existing ? 'UPDATED' : 'CREATED', 'Programación guardada.', {
        SupplierId: schedule.supplierId,
        SupplierName: schedule.supplierName,
        ContactEmail: schedule.contactEmail,
        AdditionalMessage: schedule.additionalMessage || '',
        UpdatePeriodDays: schedule.updatePeriodDays,
        LastCatalogUpdate: schedule.lastCatalogUpdate.toISOString(),
        NextDueAt: schedule.nextDueAt.toISOString(),
        ...reminderDates(schedule.nextDueAt),
        Active: schedule.active,
      });
    },

    ReportCatalogUpdate: async (args, _callback, _headers, req) => {
      const errors = validateScheduleInput(args, { req });
      if (!validDate(args.UpdatedAt)) errors.push('UpdatedAt debe ser una fecha ISO 8601 válida con zona horaria.');
      if (errors.length) return response(false, 'INVALID_ARGUMENT', errors.join(' '));

      const schedule = await SupplierSchedule.findOne({ supplierId: args.SupplierId.trim(), active: true });
      if (!schedule) return response(false, 'NOT_FOUND', 'No existe una programación activa para ese mayorista.');
      const updatedAt = new Date(args.UpdatedAt);
      if (updatedAt > new Date(Date.now() + 5 * 60 * 1000)) return response(false, 'INVALID_DATE', 'UpdatedAt no puede estar más de cinco minutos en el futuro.');
      if (updatedAt < schedule.lastCatalogUpdate) return response(false, 'STALE_UPDATE', 'UpdatedAt es anterior a la última actualización registrada.');
      if (updatedAt.getTime() === schedule.lastCatalogUpdate.getTime()) {
        return response(true, 'ALREADY_RECORDED', 'Esa actualización ya estaba registrada.', {
          SupplierId: schedule.supplierId,
          NextDueAt: schedule.nextDueAt.toISOString(),
          ...reminderDates(schedule.nextDueAt),
        });
      }

      schedule.lastCatalogUpdate = updatedAt;
      schedule.nextDueAt = addDays(updatedAt, schedule.updatePeriodDays);
      schedule.updatedBySystem = args.ConsumerSystem.trim();
      schedule.lastReminderFor = null;
      schedule.remindersSent = [];
      schedule.attempts = 0;
      schedule.nextAttemptAt = new Date();
      schedule.lockedUntil = new Date(0);
      await schedule.save();
      return response(true, 'UPDATED', 'Actualización del catálogo registrada.', {
        SupplierId: schedule.supplierId,
        NextDueAt: schedule.nextDueAt.toISOString(),
        ...reminderDates(schedule.nextDueAt),
      });
    },

    CancelSupplierSchedule: async (args, _callback, _headers, req) => {
      const errors = validateScheduleInput(args, { req });
      if (errors.length) return response(false, 'INVALID_ARGUMENT', errors.join(' '));
      const schedule = await SupplierSchedule.findOneAndUpdate(
        { supplierId: args.SupplierId.trim(), active: true },
        { $set: { active: false, lockedUntil: new Date(0) } },
        { new: true },
      );
      if (!schedule) return response(false, 'NOT_FOUND', 'No existe una programación activa para ese mayorista.');
      return response(true, 'CANCELLED', 'Programación cancelada.', { SupplierId: schedule.supplierId });
    },

    GetSupplierSchedule: async (args, _callback, _headers, req) => {
      const errors = validateScheduleInput(args, { req });
      if (errors.length) return response(false, 'INVALID_ARGUMENT', errors.join(' '));
      const schedule = await SupplierSchedule.findOne({ supplierId: args.SupplierId.trim() }).lean();
      if (!schedule) return response(false, 'NOT_FOUND', 'No existe una programación para ese mayorista.');
      return response(true, 'FOUND', 'Programación encontrada.', {
        SupplierId: schedule.supplierId,
        SupplierName: schedule.supplierName,
        ContactEmail: schedule.contactEmail,
        AdditionalMessage: schedule.additionalMessage || '',
        UpdatePeriodDays: schedule.updatePeriodDays,
        LastCatalogUpdate: schedule.lastCatalogUpdate.toISOString(),
        NextDueAt: schedule.nextDueAt.toISOString(),
        ...reminderDates(schedule.nextDueAt),
        Active: schedule.active,
        LastReminderFor: schedule.lastReminderFor?.toISOString() || '',
      });
    },
  };
}
