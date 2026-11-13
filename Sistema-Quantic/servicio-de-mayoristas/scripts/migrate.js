import 'dotenv/config';
import mongoose from 'mongoose';
import { config } from '../config.js';
const sourceUri = process.env.SOURCE_MONGODB_URI || 'mongodb://127.0.0.1:27017/inventario';
const source = await mongoose.createConnection(sourceUri).asPromise();
const target = await mongoose.createConnection(config().uri).asPromise();
try {
  if (source.name === target.name && source.host === target.host && source.port === target.port) throw new Error('Origen y destino deben ser distintos.');
  for (const name of ['suppliers', 'supplierstocks', 'stockbatches', 'stockversions', 'users']) {
    const filter = name === 'users' ? { role: 'mayorista' } : {};
    let count = 0;
    for await (const doc of source.collection(name).find(filter)) {
      await target.collection(name).updateOne({ _id: doc._id }, { $setOnInsert: doc }, { upsert: true });
      count++;
    }
    console.log(name + ': ' + count + ' documentos revisados. Solo se insertan faltantes.');
  }
} finally { await source.close(); await target.close(); }
