import { DatabaseSync } from 'node:sqlite';
export class Repository {
  constructor(path, clients = []) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS dashboards (client TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(client,id)); CREATE TABLE IF NOT EXISTS reports (client TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(client,id));');
    this.db.exec('CREATE TABLE IF NOT EXISTS updates (client TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(client,id));');
    for (const client of clients) this.createDashboard(client, 'DASH-01', { idDashboard: 'DASH-01', nombre: 'Disponibilidad comercial', indicadores: ['totalProductos', 'productosConStock', 'productosSinStock', 'unidadesDisponibles'], filtros: {} });
  }
  ping() { this.db.prepare('SELECT 1').get(); }
  listDashboards(client) { return this.db.prepare('SELECT data FROM dashboards WHERE client=? ORDER BY id').all(client).map(row => JSON.parse(row.data)); }
  getUpdate(client, id) { const row = this.db.prepare('SELECT data FROM updates WHERE client=? AND id=?').get(client, id); return row ? JSON.parse(row.data) : null; }
  saveUpdate(client, id, data) { this.db.prepare('INSERT INTO updates VALUES (?,?,?)').run(client, id, JSON.stringify(data)); }
  transaction(callback) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = callback(); this.db.exec('COMMIT'); return value; }
    catch (err) { this.db.exec('ROLLBACK'); throw err; }
  }
  getDashboard(client, id) { const row = this.db.prepare('SELECT data FROM dashboards WHERE client=? AND id=?').get(client, id); return row ? JSON.parse(row.data) : null; }
  createDashboard(client, id, data) { return this.db.prepare('INSERT OR IGNORE INTO dashboards VALUES (?,?,?)').run(client, id, JSON.stringify(data)).changes > 0; }
  updateDashboard(client, id, data) { return this.db.prepare('UPDATE dashboards SET data=? WHERE client=? AND id=?').run(JSON.stringify(data), client, id).changes > 0; }
  saveReport(client, id, data) { this.db.prepare('INSERT INTO reports VALUES (?,?,?)').run(client, id, JSON.stringify(data)); }
  getReport(client, id) { const row = this.db.prepare('SELECT data FROM reports WHERE client=? AND id=?').get(client, id); return row ? JSON.parse(row.data) : null; }
  close() { this.db.close(); }
}
