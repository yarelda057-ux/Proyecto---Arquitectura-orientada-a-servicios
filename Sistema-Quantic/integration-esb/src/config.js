import 'dotenv/config';
const key = process.env.ESB_API_KEY || '';
const soapKey = process.env.NOTIFICATION_SERVICE_KEY || '';
if (Buffer.byteLength(key) < 32 || Buffer.byteLength(soapKey) < 32) throw new Error('ESB_API_KEY y NOTIFICATION_SERVICE_KEY deben tener al menos 32 bytes.');
const port = Number(process.env.PORT || 8003);
const timeoutMs = Number(process.env.SOAP_TIMEOUT_MS || 5000);
if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 30000) throw new Error('PORT o SOAP_TIMEOUT_MS inválidos.');
export const config = Object.freeze({ host: process.env.HOST || '127.0.0.1', port, apiKey: key, soapKey, soapUrl: process.env.NOTIFICATION_SERVICE_URL || 'http://127.0.0.1:8002/soap/notifications', timeoutMs, consumerSystem: process.env.SOAP_CONSUMER_SYSTEM || 'esb' });
