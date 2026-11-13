import mongoose from 'mongoose';

const supplierScheduleSchema = new mongoose.Schema({
  supplierId: { type: String, required: true, trim: true, maxlength: 100 },
  supplierName: { type: String, required: true, trim: true, maxlength: 160 },
  contactEmail: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  additionalMessage: { type: String, trim: true, maxlength: 500, default: '' },
  updatePeriodDays: { type: Number, required: true, min: 1, max: 3650 },
  lastCatalogUpdate: { type: Date, required: true },
  nextDueAt: { type: Date, required: true },
  active: { type: Boolean, default: true },
  updatedBySystem: { type: String, required: true, trim: true, maxlength: 100 },
  lastReminderFor: { type: Date, default: null },
  remindersSent: { type: [Number], default: [] },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  lockedUntil: { type: Date, default: () => new Date(0) },
}, { timestamps: true, bufferCommands: false });

supplierScheduleSchema.index({ supplierId: 1 }, { unique: true });
supplierScheduleSchema.index({ active: 1, nextDueAt: 1, nextAttemptAt: 1, lockedUntil: 1 });

export default mongoose.model('SupplierSchedule', supplierScheduleSchema);
