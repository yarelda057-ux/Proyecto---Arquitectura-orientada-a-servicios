import 'dotenv/config';
export function config() {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error('JWT_SECRET requiere al menos 32 bytes.');
  const integrationKey = process.env.INTEGRATION_KEY;
  if (integrationKey && Buffer.byteLength(integrationKey) < 32) throw new Error('INTEGRATION_KEY demasiado corta.');
  return { secret, integrationKey, uri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mayoristas', port: Number(process.env.PORT || 3001) };
}
