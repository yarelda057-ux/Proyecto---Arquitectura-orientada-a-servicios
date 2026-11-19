const { randomBytes, scrypt: derive, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');
const db = require('./config/db');
const scrypt = promisify(derive), sessions = new Map();
const fail = (status, message) => Object.assign(new Error(message), { status });
async function migrate() {
  if (db.isMySQLConnected()) {
    const columns = await db.query('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', ['empresas']);
    for (const name of ['region', 'sede']) if (!columns.some(c => c.COLUMN_NAME === name)) await db.query('ALTER TABLE empresas ADD COLUMN ' + name + ' VARCHAR(160) NULL');
  }
  if (db.isMySQLConnected()) await db.query(`CREATE TABLE IF NOT EXISTS cuentas_servicios (email VARCHAR(254) PRIMARY KEY, empresa_id INT NOT NULL, password_hash VARCHAR(200) NOT NULL)`);
}
async function save(companyId, email, password) {
  if (!db.isMySQLConnected()) throw fail(503, 'No se puede guardar el acceso en este momento.');
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== 'string' || password.length < 15 || password.length > 128) throw fail(400, 'Correo valido y contrasena de 15 a 128 caracteres requeridos.');
  email = email.trim().toLowerCase();
  const prior = await db.query('SELECT empresa_id FROM cuentas_servicios WHERE email = ?', [email]);
  if (prior[0] && Number(prior[0].empresa_id) !== Number(companyId)) throw fail(409, 'Este correo ya tiene otro perfil.');
  const salt = randomBytes(16).toString('hex'), hash = (await scrypt(password, salt, 64)).toString('hex');
  await db.query('INSERT INTO cuentas_servicios (email, empresa_id, password_hash) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)', [email, companyId, salt + ':' + hash]);
  for (const [key, item] of sessions) if (item.email === email) sessions.delete(key);
}
const digest = token => createHash('sha256').update(token).digest('hex');
function session(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  const key = digest(token), item = sessions.get(key);
  if (!item || item.expires <= Date.now()) { sessions.delete(key); return null; }
  return { role: 'empresa', companyId: item.companyId, email: item.email, sub: item.email };
}
async function login(email, password) {
  if (!db.isMySQLConnected()) throw fail(503, 'El acceso no esta disponible temporalmente.');
  if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || password.length > 128) throw fail(400, 'Credenciales invalidas.');
  email = email.trim().toLowerCase();
  const rows = await db.query('SELECT * FROM cuentas_servicios WHERE email = ?', [email]);
  const account = rows[0];
  const [salt, stored] = (account?.password_hash || '00000000000000000000000000000000:' + '00'.repeat(64)).split(':');
  const hash = await scrypt(password, salt, 64);
  if (!account || !timingSafeEqual(hash, Buffer.from(stored, 'hex'))) throw fail(401, 'Correo o contrasena incorrectos.');
  for (const [key, item] of sessions) if (item.expires <= Date.now()) sessions.delete(key);
  if (sessions.size >= 10000) throw fail(503, 'Intenta iniciar sesion mas tarde.');
  const token = randomBytes(32).toString('hex');
  sessions.set(digest(token), { companyId: account.empresa_id, email, expires: Date.now() + 3600000 });
  return { token, expires_in: 3600 };
}
function logout(token) { if (typeof token === 'string') sessions.delete(digest(token)); }
module.exports = { migrate, save, login, session, logout };
