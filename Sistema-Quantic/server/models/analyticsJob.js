import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  _id: String,
  sequence: { type: Number, unique: true, required: true },
  actorId: String, batchId: String, operationId: String, correlationId: String, auditId: String,
  state: { type: String, enum: ['pending', 'complete', 'failed'], default: 'pending' },
  dashboardDone: { type: Boolean, default: false },
  dashboardReceipt: mongoose.Schema.Types.Mixed,
  auditDone: { type: Boolean, default: false },
  auditEvent: mongoose.Schema.Types.Mixed,
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  lockedUntil: { type: Date, default: () => new Date(0) },
  leaseToken: String, lastError: String, completedAt: Date,
}, { timestamps: true, bufferCommands: false });
schema.index({ state: 1, nextAttemptAt: 1, lockedUntil: 1 });
export default mongoose.model('AnalyticsJob', schema);
