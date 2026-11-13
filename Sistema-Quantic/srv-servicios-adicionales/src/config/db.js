// =============================================================================
// CONFIGURACIÓN DE CONEXIÓN A BASE DE DATOS (MySQL)
// Microservicio: SRV-G5202605 - Quantic Technology S.A.C.
// =============================================================================

const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'quantic_servicios_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let pool = null;
let isConnected = false;

// Inicializa el pool y comprueba la conectividad de forma no bloqueante
async function checkDatabaseConnection() {
  try {
    pool = mysql.createPool(dbConfig);
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    isConnected = true;
    console.log(`[MySQL] Conexión establecida con éxito a la base de datos "${dbConfig.database}" en ${dbConfig.host}:${dbConfig.port}`);
    return true;
  } catch (error) {
    isConnected = false;
    console.warn(`[MySQL] Aviso: No se pudo conectar a MySQL con las credenciales actuales (${error.message}).`);
    console.warn(`[MySQL] El microservicio continuará ejecutándose en MODO DEMOSTRACIÓN EN MEMORIA.`);
    console.warn(`[MySQL] Para activar persistencia real en MySQL:`);
    console.warn(`        1. Crea la base de datos ejecutando el script "database/schema.sql" en MySQL Workbench.`);
    console.warn(`        2. Edita el archivo ".env" con tu contraseña de MySQL.`);
    console.warn(`        3. Reinicia la aplicación con "npm start".`);
    return false;
  }
}

// Ejecuta consultas SQL en el pool si está disponible
async function query(sql, params = []) {
  if (!isConnected || !pool) {
    throw new Error('MySQL no está conectado');
  }
  const [rows] = await pool.execute(sql, params);
  return rows;
}

module.exports = {
  dbConfig,
  checkDatabaseConnection,
  query,
  isMySQLConnected: () => isConnected,
  getPool: () => pool
};
