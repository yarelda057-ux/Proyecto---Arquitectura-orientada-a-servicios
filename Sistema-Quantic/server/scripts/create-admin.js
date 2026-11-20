import 'dotenv/config';
import mongoose from 'mongoose';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import User from '../models/user.js';
                                                                                   
let hidden = false;
const output = new Writable({ write(chunk, encoding, callback) { if (!hidden) process.stdout.write(chunk, encoding); callback(); } });
const prompt = createInterface({ input: process.stdin, output, terminal: true });
try {
  const email = (await prompt.question('Correo del administrador: ')).trim().toLowerCase();
  process.stdout.write('Contraseña nueva (mínimo 15 caracteres, no se muestra): ');
  hidden = true;
  const password = await prompt.question('');
  hidden = false; process.stdout.write('\n');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || [...password].length < 15 || Buffer.byteLength(password) > 72) throw new Error('Datos inválidos. Usa correo válido y contraseña de 15 caracteres a 72 bytes.');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/inventario');
  if (await User.exists({ email })) throw new Error('Esa cuenta ya existe. No se modificaron sus permisos ni contraseña.');
  await User.create({ email, password, role: 'admin' });
  console.log('Administrador creado.');
} catch (error) { console.error(error.code === 11000 ? 'Esa cuenta ya existe.' : error.message); process.exitCode = 1; }
finally { prompt.close(); await mongoose.disconnect(); }
