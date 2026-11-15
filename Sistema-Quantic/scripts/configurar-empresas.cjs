// Adds only company integration settings. Existing database passwords stay untouched.
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { randomBytes } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const components = ['server', 'servicio-de-mayoristas', 'srv-servicios-adicionales'];
const files = components.map(name => {
  const file = path.join(root, name, '.env');
  const content = fs.readFileSync(file, 'utf8');
  return { name, file, content, env: parseEnv(content) };
});
const keys = [...new Set(files.map(f => f.env.COMPANY_INTEGRATION_KEY).filter(Boolean))];
if (keys.length > 1 || keys.some(k => k.length < 32)) throw new Error('Las claves de empresas existentes no coinciden. No se modificaron los archivos.');
const key = keys[0] || randomBytes(32).toString('hex');
const wholesaleKey = files[0].env.WHOLESALE_INTEGRATION_KEY;
if (!wholesaleKey || wholesaleKey.length < 32 || wholesaleKey !== files[1].env.INTEGRATION_KEY) throw new Error('La integracion existente de mayoristas debe estar configurada antes de continuar.');
const settings = {
  server: { COMPANY_INTEGRATION_KEY: key },
  'servicio-de-mayoristas': { COMPANY_INTEGRATION_KEY: key, COMPANY_SERVICE_URL: 'http://127.0.0.1:3002' },
  'srv-servicios-adicionales': { COMPANY_INTEGRATION_KEY: key, WHOLESALE_INTEGRATION_KEY: wholesaleKey, WHOLESALE_SERVICE_URL: 'http://127.0.0.1:3001', PORTAL_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173' },
};
const writes = files.map(f => {
  let content = f.content;
  for (const [name, value] of Object.entries(settings[f.name])) {
    if (f.env[name]) {
      if (name.endsWith('_KEY') && f.env[name] !== value) throw new Error('Una clave de integracion existente no coincide. No se modificaron archivos.');
      continue;
    }
    const pattern = new RegExp('^' + name + '=.*$', 'm');
    content = pattern.test(content) ? content.replace(pattern, () => name + '=' + value) : content.trimEnd() + '\n' + name + '=' + value + '\n';
  }
  return { file: f.file, content };
});
for (const f of writes) fs.writeFileSync(f.file, f.content, { mode: 0o600 });
console.log('Integracion de empresas configurada. Reinicia los servicios. No se cambiaron credenciales de MySQL ni MongoDB.');
