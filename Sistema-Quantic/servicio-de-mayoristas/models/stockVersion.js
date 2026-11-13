import { mongoose } from '../dependencies.js';

const stockVersionSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  sequence: { type: Number, required: true, default: 0, min: 0 },
}, { timestamps: true, bufferCommands: false });

export default mongoose.model('StockVersion', stockVersionSchema);
