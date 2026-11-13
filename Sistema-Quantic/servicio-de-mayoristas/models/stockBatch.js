import { mongoose } from '../dependencies.js';

const { Schema, model } = mongoose;

const stockRowSchema = new Schema({
  partNumber: { type: String, required: true, maxlength: 160 },
  descripcion: { type: String, required: true, maxlength: 1000 },
  cantidad: { type: Number, required: true, min: 0 },
  precioUsd: { type: Number, required: true, min: 0 },
  categoria: { type: String, required: true, maxlength: 160 },
}, { _id: false });

const validationErrorSchema = new Schema({
  fila: { type: Number, required: true, min: 1 },
  campo: { type: String, required: true, maxlength: 64 },
  motivo: { type: String, required: true, maxlength: 300 },
}, { _id: false });

const stockBatchSchema = new Schema({
  batchId: { type: String, required: true, unique: true, trim: true },
  supplierId: { type: String, required: true, trim: true, uppercase: true, index: true },
  idempotencyKey: { type: String, required: true, maxlength: 160 },
  nombreArchivo: { type: String, maxlength: 200 },
  contentHash: { type: String, required: true, maxlength: 64 },
  estado: { type: String, required: true, enum: ['RECIBIDO', 'VALIDANDO', 'RECHAZADO', 'VALIDADO', 'PROCESANDO', 'PROCESADO', 'FALLIDO'], default: 'RECIBIDO', index: true },
  totalFilas: { type: Number, default: 0, min: 0 },
  filasCorrectas: { type: Number, default: 0, min: 0 },
  errores: { type: [validationErrorSchema], default: [] },
  filas: { type: [stockRowSchema], default: [] },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  confirmationKey: { type: String, maxlength: 160 },
  confirmationResult: { type: Schema.Types.Mixed },
  idOperacion: { type: String, maxlength: 100 },
  versionInventario: { type: String, maxlength: 64 },
  processedAt: Date,
}, { timestamps: true, bufferCommands: false });

stockBatchSchema.index({ supplierId: 1, idempotencyKey: 1 }, { unique: true });
stockBatchSchema.index({ supplierId: 1, createdAt: -1 });

export default model('StockBatch', stockBatchSchema);
