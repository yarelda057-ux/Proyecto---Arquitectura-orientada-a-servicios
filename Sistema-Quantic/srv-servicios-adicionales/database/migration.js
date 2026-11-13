const db = require('../src/config/db');

async function migrate() {
  console.log('[Migration] Conectando a MySQL...');
  const connected = await db.checkDatabaseConnection();
  if (!connected) {
    console.error('[Migration] No se pudo conectar a MySQL.');
    process.exit(1);
  }

  try {
    console.log('[Migration] Modificando ENUM en tabla empresas...');
    await db.query(`
      ALTER TABLE empresas 
      MODIFY COLUMN estado_verificacion ENUM('PENDIENTE', 'APROBADO', 'RECHAZADO', 'INACTIVO') NOT NULL DEFAULT 'PENDIENTE'
    `);

    console.log('[Migration] Modificando ENUM en tabla servicios...');
    await db.query(`
      ALTER TABLE servicios 
      MODIFY COLUMN estado ENUM('PENDIENTE', 'APROBADO', 'RECHAZADO', 'INACTIVO') NOT NULL DEFAULT 'PENDIENTE'
    `);

    console.log('[Migration] ¡Migración completada con éxito!');
    process.exit(0);
  } catch (err) {
    console.error('[Migration] Error:', err.message);
    process.exit(1);
  }
}

migrate();
