// Configuración de desarrollo para una copia nueva. No imprime secretos.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const random = () => randomBytes(32).toString('hex');
const services = ['server', 'servicio-de-mayoristas', 'integration-esb', 'notification-service', 'srv-servicios-adicionales', 'audit-service', 'vite-project'];
const destinations = services.map(name => path.join(name, '.env')).concat('audit-service/clients.local.json');
const existing = destinations.filter(name => fs.existsSync(path.join(root, name)));
if (existing.length) {
  console.error('No se modificó ningún archivo: ya existe configuración local en ' + existing.join(', ') + '.');
  console.error('Este comando es solo para una copia nueva. Conserva tus archivos existentes.');
  process.exit(1);
}
const wholesale = random(), esb = random(), soap = random(), auditWrite = random(), auditRead = random();
const overrides = {
  server: { JWT_SECRET: random(), WHOLESALE_SERVICE_URL: 'http://127.0.0.1:3001', WHOLESALE_INTEGRATION_KEY: wholesale, INTEGRATION_ESB_URL: 'http://127.0.0.1:8003', INTEGRATION_ESB_KEY: esb, AUDIT_ENABLED: 'true', AUDIT_SERVICE_URL: 'http://127.0.0.1:8001', AUDIT_WRITE_KEY: auditWrite, AUDIT_READ_KEY: auditRead },
  'servicio-de-mayoristas': { JWT_SECRET: random(), INTEGRATION_KEY: wholesale, INTEGRATION_ESB_URL: 'http://127.0.0.1:8003', INTEGRATION_ESB_KEY: esb, CLIENT_ORIGINS: 'http://localhost:5173' },
  'integration-esb': { ESB_API_KEY: esb, NOTIFICATION_SERVICE_KEY: soap, ADDITIONAL_SERVICES_URL: 'http://127.0.0.1:3002', ADDITIONAL_SERVICES_TIMEOUT_MS: '5000' },
  'notification-service': { SOAP_CLIENT_KEYS_JSON: JSON.stringify({ inventory: random(), catalogos: random(), esb: soap }), MAIL_MODE: 'console' },
  'srv-servicios-adicionales': { PORT: '3002' },
  'audit-service': {}, 'vite-project': {},
};
// Leer y preparar todo antes de escribir para detectar plantillas faltantes.
const files = services.map(name => {
  let content = fs.readFileSync(path.join(root, name, '.env.example'), 'utf8');
  for (const [key, value] of Object.entries(overrides[name])) {
    const pattern = new RegExp('^' + key + '=.*$', 'm');
    if (pattern.test(content)) content = content.replace(pattern, () => key + '=' + value);
    else content = content.trimEnd() + '\n' + key + '=' + value + '\n';
  }
  return [path.join(root, name, '.env'), content];
});
const clients = [['inventory-writer', 'events:write', auditWrite], ['inventory-reader', 'events:read', auditRead]].map(([id, scope, key]) => ({ id, source: 'inventory', scopes: [scope], key_sha256: createHash('sha256').update(key).digest('hex') }));
files.push([path.join(root, 'audit-service/clients.local.json'), JSON.stringify(clients, null, 2) + '\n']);
for (const [file, content] of files) fs.writeFileSync(file, content, { flag: 'wx', mode: 0o600 });
console.log('Configuración local creada: claves independientes y conexiones entre servicios preparadas.');
console.log('Completa DB_USER y DB_PASSWORD en srv-servicios-adicionales/.env y crea sus tablas en MySQL.');
console.log('Notificaciones inicia en modo consola. Para correos reales, configura SMTP y MAIL_MODE=smtp en su .env.');
console.log('Los archivos generados son privados y están excluidos por .gitignore.');
