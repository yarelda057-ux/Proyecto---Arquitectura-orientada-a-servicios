import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHandler } from './app.js';
import { Repository } from './repository.js';
import { sourceClient } from './source.js';
const clients = JSON.parse(process.env.REPORTS_CLIENTS_JSON || '{}');
if (!Object.keys(clients).length || Object.values(clients).some(c => typeof c.secret !== 'string' || Buffer.byteLength(c.secret) < 32 || !Array.isArray(c.scopes) || c.scopes.some(s => !['reports:read', 'reports:write'].includes(s)))) throw new Error('Configura clientes de reportes con secretos de al menos 32 bytes y scopes válidos.');
const dbPath = resolve(process.env.REPORTS_DB_PATH || './data/reports.sqlite'); mkdirSync(dirname(dbPath), { recursive: true });
const repository = new Repository(dbPath, Object.keys(clients));
const source = sourceClient({ url: process.env.STOCK_SOURCE_URL || 'http://127.0.0.1:8003/v1/inventory-source', esbKey: process.env.SOURCE_ESB_KEY });
const port = Number(process.env.PORT || 8004);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Puerto inválido.');
const server = createServer({ requestTimeout: 15000, headersTimeout: 10000 }, createHandler({ clients, repository, source }));
server.listen(port, process.env.HOST || '127.0.0.1', () => console.info(`Servicio de Reportes y Dashboards de Inventario: puerto ${port}`));
function stop() { server.close(() => { repository.close(); process.exit(0); }); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
