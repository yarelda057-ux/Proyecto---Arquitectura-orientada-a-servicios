import { mongoose } from '../dependencies.js';

const { Schema, model } = mongoose;

const supplierSchema = new Schema({
  supplierId: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 64 },
  nombre: { type: String, required: true, trim: true, maxlength: 160 },
  ruc: { type: String, trim: true, match: /^\d{11}$/ },
  correoContacto: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  periodoActualizacionDias: { type: Number, default: 30, min: 1, max: 365 },
  activo: { type: Boolean, default: true },
  additionalMessage: { type: String, default: '', trim: true, maxlength: 500 },
  notificationSyncStatus: { type: String, enum: ['pending', 'synced'], default: 'pending', index: true },
  notificationsEnabled: { type: Boolean, default: true },
  notificationCancelPending: { type: Boolean, default: false },
  notificationRevision: { type: Number, default: 1, min: 1 },
}, { timestamps: true, bufferCommands: false });

supplierSchema.index({ nombre: 1 });

export default model('Supplier', supplierSchema);
