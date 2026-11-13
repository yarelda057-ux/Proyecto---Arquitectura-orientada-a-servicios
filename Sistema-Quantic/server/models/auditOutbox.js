import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  _id: String,
  event: { type: mongoose.Schema.Types.Mixed, required: true },
  state: { type: String, enum: ['pending', 'failed'], default: 'pending' },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  lockedUntil: { type: Date, default: () => new Date(0) },
  leaseToken: String,
  lastStatus: Number,
}, { timestamps: true, bufferCommands: false });
schema.index({ state: 1, nextAttemptAt: 1, lockedUntil: 1 });
export default mongoose.model('AuditOutbox', schema);
