import { mongoose } from '../dependencies.js';
import SupplierStock from '../models/supplierStock.js';
import { productCategory } from './categories.js';

const { Schema } = mongoose;
export const StockSnapshot = mongoose.model('StockSnapshot', new Schema({
  _id: String, sequence: { type: Number, unique: true, required: true },
  actualizadoEn: { type: Date, required: true }, total: Number, chunks: Number,
  actorId: String, batchId: String, operationId: String,
}, { bufferCommands: false }));
export const StockSnapshotChunk = mongoose.model('StockSnapshotChunk', new Schema({
  version: { type: String, required: true }, chunk: Number, productos: [Schema.Types.Mixed],
}, { bufferCommands: false }));
StockSnapshotChunk.schema.index({ version: 1, chunk: 1 }, { unique: true });

export function snapshotProduct(p) {
  return { idProducto: String(p._id), idMayorista: p.supplierId, nombre: p.descripcion, ...productCategory(p), stock: p.cantidad };
}

// Written inside the stock transaction: a durable event and the exact data it references.
// Chunks avoid MongoDB's per-document size limit. No credentials are stored.
export async function captureSnapshot({ versionInventario, actorId, batchId, operationId, session }) {
  const products = await SupplierStock.find({}).sort({ _id: 1 }).limit(100001).session(session).lean();
  if (products.length > 100000) throw Object.assign(new Error('El inventario supera el limite analitico de 100000 productos.'), { status: 413 });
  const rows = products.map(snapshotProduct);
  if (Buffer.byteLength(JSON.stringify(rows)) > 30 * 1024 * 1024) throw Object.assign(new Error('El inventario supera el limite analitico de 30 MiB.'), { status: 413 });
  const chunks = [];
  for (let i = 0; i < rows.length; i += 500) chunks.push({ version: versionInventario, chunk: chunks.length, productos: rows.slice(i, i + 500) });
  if (chunks.length) await StockSnapshotChunk.insertMany(chunks, { session, ordered: true });
  await StockSnapshot.create([{ _id: versionInventario, sequence: Number(versionInventario.slice(4)), actualizadoEn: new Date(), total: rows.length, chunks: chunks.length, actorId: String(actorId), batchId, operationId }], { session });
}

export async function readSnapshot(version, supplierId) {
  const meta = await StockSnapshot.findById(version).lean();
  if (!meta) return null;
  const chunks = await StockSnapshotChunk.find({ version }).sort({ chunk: 1 }).lean();
  const all = chunks.flatMap(chunk => chunk.productos);
  if (chunks.length !== meta.chunks || all.length !== meta.total) throw Object.assign(new Error('Version de inventario incompleta.'), { status: 503 });
  const productos = supplierId ? all.filter(p => p.idMayorista === supplierId) : all;
  return { versionInventario: version, revisionInventario: meta.sequence, actualizadoEn: meta.actualizadoEn, total: productos.length, productos };
}
