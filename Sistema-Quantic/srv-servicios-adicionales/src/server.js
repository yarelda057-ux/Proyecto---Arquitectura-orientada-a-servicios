// =============================================================================
// PUNTO DE ENTRADA DEL SERVIDOR
// Microservicio: SRV-G5202605 - Quantic Technology S.A.C.
// =============================================================================

require('dotenv').config();
const app = require('./app');
const db = require('./config/db');

const PORT = process.env.PORT || 3000;

async function iniciarServidor() {
  console.log('------------------------------------------------------------');
  console.log(' Iniciando Microservicio: Servicio de Consulta de Servicios Adicionales');
  console.log(' Identificador: SRV-G5202605 | Dominio: Comercial');
  console.log(' Proveedor: Quantic Technology S.A.C.');
  console.log('------------------------------------------------------------');

  // Verificar disponibilidad de MySQL
  await db.checkDatabaseConnection();

  app.listen(PORT, () => {
    console.log(`\n Servidor ejecutándose en el puerto: ${PORT}`);
    console.log(` Acceso a la Interfaz Web: http://localhost:${PORT}`);
    console.log(` Endpoint de Diagnóstico:   http://localhost:${PORT}/api/v1/salud`);
    console.log(` Catálogo de Servicios:     http://localhost:${PORT}/api/v1/catalogo/servicios`);
    console.log(` Directorio de Empresas:    http://localhost:${PORT}/api/v1/catalogo/empresas`);
    console.log('------------------------------------------------------------\n');
  });
}

iniciarServidor().catch((err) => {
  console.error('Error fatal al iniciar el servidor:', err);
  process.exit(1);
});
