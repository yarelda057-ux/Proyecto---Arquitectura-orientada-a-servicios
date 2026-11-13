import { mongoose } from '../dependencies.js';
const { Schema, model } = mongoose;
const notificationOutboxSchema = new Schema({
  eventId: { type: String, required: true, unique: true, maxlength: 200 },
  eventType: { type: String, required: true, enum: ['sync-schedule','catalog-updated','cancel-schedule'] },
  supplierId: { type: String, required: true, index: true },
  status: { type: String, required: true, enum: ['pending','processing','sent','failed'], default: 'pending', index: true },
  attempts: { type: Number, default: 0, min: 0 },
  nextAttemptAt: { type: Date, default: Date.now, index: true },
  lastError: { type: String, maxlength: 500 },
  sentAt: Date,
  catalogAt: Date,
}, { timestamps: true, bufferCommands: false });
notificationOutboxSchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });
export default model('NotificationOutbox', notificationOutboxSchema);
