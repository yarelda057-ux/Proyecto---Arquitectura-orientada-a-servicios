import 'dotenv/config';
import mongoose from 'mongoose';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import User from '../models/user.js';
import Session from '../models/session.js';

// Recuperacion local: requiere acceso al equipo y a la configuracion de MongoDB.
// No se expone como endpoint ni recibe contrasenas mediante argumentos.
if (!process.stdin.isTTY) {
  console.error('Ejecuta este comando directamente en una terminal interactiva.');
  process.exit(1);
}
let hidden = false;
let changed = false;
const output = new Writable({ write(chunk, encoding, callback) {
  if (!hidden) process.stdout.write(chunk, encoding);
  callback();
} });
const prompt = createInterface({ input: process.stdin, output, terminal: true });
prompt.on('SIGINT', () => {
  prompt.close();
  mongoose.disconnect().finally(() => process.exit(130));
});
async function secret(label) {
  process.stdout.write(label);
  hidden = true;
  try { return await prompt.question(''); }
  finally { hidden = false; process.stdout.write('\n'); }
}
try {
  const email = (await prompt.question('Correo del administrador que deseas recuperar: ')).trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Ingresa un correo valido.');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/inventario', { serverSelectionTimeoutMS: 5000 });
  const user = await User.findOne({ email, role: 'admin' }).select('+password');
  if (!user) throw new Error('No existe un administrador con ese correo en esta base de datos. No se modifico ninguna cuenta.');
  if (user.isActive === false) throw new Error('La cuenta esta desactivada. Este comando no modifica su estado.');
  const password = await secret('Nueva contrasena (minimo 15 caracteres; no se muestra): ');
  if ([...password].length < 15 || Buffer.byteLength(password) > 72) throw new Error('Usa una contrasena de al menos 15 caracteres y como maximo 72 bytes.');
  const confirmation = await secret('Repite la nueva contrasena: ');
  if (password !== confirmation) throw new Error('Las contrasenas no coinciden. No se realizaron cambios.');
  if (await user.comparePassword(password)) throw new Error('Elige una contrasena diferente a la anterior.');
  // save ejecuta el hash bcrypt del modelo; nunca guardar texto plano con updateOne.
  user.password = password;
  await user.save();
  changed = true;
  await Session.deleteMany({ userId: user._id });
  console.log('Contrasena del administrador actualizada. Sus sesiones anteriores se cerraron.');
  console.log('Ya puedes iniciar sesion con tu correo y la nueva contrasena.');
} catch (error) {
  if (changed) console.error('La contrasena se actualizo, pero no se pudieron cerrar todas las sesiones anteriores.');
  else if (error.name === 'MongooseServerSelectionError' || error.name === 'MongoServerError') console.error('No se pudo completar la recuperacion. Comprueba MongoDB y la configuracion local.');
  else console.error(error.message);
  process.exitCode = 1;
} finally {
  prompt.close();
  await mongoose.disconnect();
}