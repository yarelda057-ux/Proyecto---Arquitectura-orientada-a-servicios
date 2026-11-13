import { mongoose } from '../dependencies.js';

const { Schema, model } = mongoose;

const supplierStockSchema = new Schema({
  supplierId: { type: String, required: true, trim: true, uppercase: true, index: true },
  partNumber: { type: String, required: true, trim: true, maxlength: 160 },
  descripcion: { type: String, required: true, maxlength: 1000 },
  cantidad: { type: Number, required: true, min: 0 },
  precioUsd: { type: Number, required: true, min: 0 },
  categoria: { type: String, required: true, maxlength: 160, default: 'Sin categoría' },
  versionInventario: { type: String, required: true, maxlength: 64 },
  lastBatchId: { type: String, required: true, maxlength: 64 },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, bufferCommands: false });

supplierStockSchema.index({ supplierId: 1, partNumber: 1 }, { unique: true });
supplierStockSchema.index({ supplierId: 1, categoria: 1, partNumber: 1 });

export default model('SupplierStock', supplierStockSchema);
