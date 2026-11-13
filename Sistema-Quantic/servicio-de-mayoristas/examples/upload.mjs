// Ejemplo para otro sistema. Ejecutar con SERVICE_URL, SERVICE_EMAIL,
// SERVICE_PASSWORD y SUPPLIER_ID en variables de entorno; archivo como argumento.
// node examples/upload.mjs stock.xlsx
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const base = process.env.SERVICE_URL || 'http://localhost:3001';
let token;
async function call(path, method = 'GET', body, idempotencyKey) {
  const response = await fetch(base + path, { method, headers: {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: 'Bearer ' + token } : {}),
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(response.status + ': ' + data.message);
  return data;
}
if (!process.argv[2] || !process.env.SERVICE_EMAIL || !process.env.SERVICE_PASSWORD || !process.env.SUPPLIER_ID) throw new Error('Falta archivo, credenciales o SUPPLIER_ID.');
const session = await call('/api/v1/auth/login', 'POST', { email: process.env.SERVICE_EMAIL, password: process.env.SERVICE_PASSWORD });
token = session.access_token;
try {
 const batch = await call('/api/v1/stock/upload', 'POST', { idMayorista: process.env.SUPPLIER_ID, formato: 'XLSX', archivoBase64: (await readFile(process.argv[2])).toString('base64') }, randomUUID());
 const validation = await call('/api/v1/stock/upload/' + batch.idLote + '/validate');
 if (!validation.esValido) { console.log(validation); process.exitCode = 1; }
 else console.log(await call('/api/v1/stock/lotes/' + batch.idLote + '/confirmacion', 'POST', {}, randomUUID()));
} finally { await call('/api/v1/auth/logout', 'POST', {}); }
