import 'dotenv/config';

const integer = (name, fallback, { min, max }) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} debe ser un entero entre ${min} y ${max}.`);
  }
  return value;
};

let soapClientKeys;
try {
  soapClientKeys = JSON.parse(process.env.SOAP_CLIENT_KEYS_JSON || '');
} catch {
  throw new Error('Configura SOAP_CLIENT_KEYS_JSON en notification-service/.env como un objeto JSON con un token por sistema consumidor.');
}
if (!soapClientKeys || Array.isArray(soapClientKeys) || typeof soapClientKeys !== 'object' || Object.keys(soapClientKeys).length === 0
  || Object.entries(soapClientKeys).some(([name, key]) => !/^[a-zA-Z0-9_-]{1,100}$/.test(name) || typeof key !== 'string' || key.length < 32)
  || new Set(Object.values(soapClientKeys)).size !== Object.keys(soapClientKeys).length) {
  throw new Error('SOAP_CLIENT_KEYS_JSON requiere nombres válidos, claves distintas de al menos 32 caracteres y una clave por consumidor.');
}

const mailMode = process.env.MAIL_MODE || 'console';
if (!['console', 'smtp'].includes(mailMode)) throw new Error('MAIL_MODE debe ser console o smtp.');
if (mailMode === 'smtp' && (!process.env.SMTP_HOST || !process.env.MAIL_FROM)) {
  throw new Error('SMTP_HOST y MAIL_FROM son obligatorios cuando MAIL_MODE=smtp.');
}

const publicUrl = (process.env.SOAP_PUBLIC_URL || 'http://127.0.0.1:8002').replace(/\/$/, '');
const host = process.env.HOST || '127.0.0.1';
if (process.env.NODE_ENV === 'production' && (!publicUrl.startsWith('https://') || host === '0.0.0.0')) {
  throw new Error('En producción usa SOAP_PUBLIC_URL con HTTPS y limita HOST a una interfaz protegida.');
}

export const config = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  host,
  port: integer('PORT', 8002, { min: 1, max: 65535 }),
  publicUrl,
  soapClientKeys: Object.freeze(soapClientKeys),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
  mongoDb: process.env.MONGODB_DB || 'quantic_notifications',
  workerIntervalMs: integer('WORKER_INTERVAL_MS', 60000, { min: 5000, max: 3600000 }),
  mailMode,
  smtpHost: process.env.SMTP_HOST,
  smtpPort: integer('SMTP_PORT', 587, { min: 1, max: 65535 }),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER,
  smtpPassword: process.env.SMTP_PASSWORD,
  mailFrom: process.env.MAIL_FROM || 'notificaciones@example.com',
});
