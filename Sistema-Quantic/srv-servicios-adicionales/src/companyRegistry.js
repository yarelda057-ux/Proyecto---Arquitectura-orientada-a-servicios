const db = require('./config/db');
const Empresa = require('./models/empresaModel');
const { sign } = require('./companySecurity');

function capabilities(value) {
  const { ofrece_servicios, provee_equipos } = value || {};
  if (typeof ofrece_servicios !== 'boolean' || typeof provee_equipos !== 'boolean' || (!ofrece_servicios && !provee_equipos)) throw Object.assign(new Error('Selecciona servicios, equipos o ambas actividades.'), { status: 400 });
  return { ofrece_servicios, provee_equipos };
}
async function migrate() {
  if (!db.isMySQLConnected()) return;
  const columns = await db.query('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', ['empresas']);
  const names = new Set(columns.map(c => c.COLUMN_NAME));
  if (!names.has('ofrece_servicios')) await db.query('ALTER TABLE empresas ADD COLUMN ofrece_servicios BOOLEAN NOT NULL DEFAULT TRUE');
  if (!names.has('provee_equipos')) await db.query('ALTER TABLE empresas ADD COLUMN provee_equipos BOOLEAN NOT NULL DEFAULT FALSE');
}
async function updateActivities(id, values) {
  const flags = capabilities(values);
  const company = await Empresa.getById(id);
  if (!company) throw Object.assign(new Error('Empresa no encontrada.'), { status: 404 });
  if (db.isMySQLConnected()) await db.query('UPDATE empresas SET ofrece_servicios = ?, provee_equipos = ? WHERE id = ?', [flags.ofrece_servicios, flags.provee_equipos, id]);
  else Object.assign(company, flags);
  return { ...company, ...flags };
}
async function wholesale(path, identity, { method = 'GET', body } = {}) {
  const url = new URL(process.env.WHOLESALE_SERVICE_URL || 'http://127.0.0.1:3001');
  if (url.username || url.password || (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw Object.assign(new Error('URL de stock invalida.'), { status: 503 });
  const token = sign({ iss: 'inventory-gateway', aud: 'wholesale-api', sub: identity.sub, role: 'admin', email: identity.email }, process.env.WHOLESALE_INTEGRATION_KEY);
  let response;
  try { response = await fetch(new URL('/api/v1/stock' + path, url), { method, redirect: 'error', signal: AbortSignal.timeout(8000), headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
  catch { throw Object.assign(new Error('El servicio de stock no responde. Puedes reintentar sin duplicar la empresa.'), { status: 503 }); }
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.message || 'No se pudo completar la operacion de stock.'), { status: response.status });
  return data;
}
module.exports = { capabilities, migrate, updateActivities, wholesale };
