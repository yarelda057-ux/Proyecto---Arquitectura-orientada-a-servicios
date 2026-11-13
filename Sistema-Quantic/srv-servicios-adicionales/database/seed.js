// =============================================================================
// SCRIPT DE POBLADO DE DATOS INICIALES (DEMO) EN MYSQL
// Microservicio: SRV-G5202605 - Quantic Technology S.A.C.
// =============================================================================

const db = require('../src/config/db');

async function seedDatabase() {
  console.log('[Seed] Conectando a MySQL para verificar datos de demostración...');
  const conectado = await db.checkDatabaseConnection();
  if (!conectado) {
    console.error('[Seed] No se pudo conectar a MySQL. Verifique su archivo .env');
    process.exit(1);
  }

  // 1. Semillas de Empresas
  const sqlEmpresas = `
    INSERT INTO empresas (id, razon_social, ruc, email_contacto, telefono, sitio_web, direccion, ciudad, descripcion, estado_verificacion, fecha_revision, notas_revision)
    VALUES 
    (1, 'TechFix Soluciones Digitales [DEMO]', '20601234561', 'contacto@techfix-demo.pe', '+51 987 654 321', 'https://techfix-demo.pe', 'Av. Javier Prado Este 2450, San Borja', 'Lima', 'Especialistas en soporte computacional, mantenimiento preventivo y recuperación operativa para empresas.', 'APROBADO', NOW(), 'Aprobado en revisión técnica inicial.'),
    (2, 'ConectaRedes del Perú [DEMO]', '20602345672', 'proyectos@conectaredes-demo.pe', '+51 976 543 210', 'https://conectaredes-demo.pe', 'Calle Los Sauces 114, Yanahuara', 'Arequipa', 'Diseño, cableado estructurado certificado e infraestructura de enlaces de red de alta velocidad.', 'APROBADO', NOW(), 'Documentación y experiencia verificadas.'),
    (3, 'CiberShield Protec [DEMO]', '20603456783', 'seguridad@cibershield-demo.pe', '+51 965 432 109', 'https://cibershield-demo.pe', 'Av. San Martín 880, Miraflores', 'Lima', 'Soluciones de blindaje perimetral, auditorías de vulnerabilidad y políticas de copias de seguridad.', 'APROBADO', NOW(), 'Cumple con estándares de ciberseguridad requeridos.'),
    (4, 'InnovaTech Consultores [DEMO]', '20604567894', 'info@innovatech-demo.pe', '+51 954 321 098', 'https://innovatech-demo.pe', 'Jr. Pizarro 420, Centro Histórico', 'Trujillo', 'Asesoría estratégica en transformación digital, modernización de software e integración de procesos.', 'APROBADO', NOW(), 'Verificación completa.'),
    (5, 'Sistemas Cloud Andina [DEMO - PENDIENTE]', '20605678905', 'hola@cloudandina-demo.pe', '+51 943 210 987', 'https://cloudandina-demo.pe', 'Av. El Sol 340', 'Cusco', 'Migración e infraestructura en la nube para mypes y empresas comerciales.', 'PENDIENTE', NULL, NULL)
    ON DUPLICATE KEY UPDATE razon_social = VALUES(razon_social);
  `;

  // 2. Semillas de Servicios
  const sqlServicios = `
    INSERT INTO servicios (id, empresa_id, nombre, descripcion, categoria, tipo_servicio, precio_referencial, estado)
    VALUES
    (1, 1, 'Reparación y Mantenimiento de Computadoras', 'Limpieza profunda de hardware, cambio de pasta térmica, diagnóstico de fallas y sustitución de piezas defectuosas.', 'Soporte técnico', 'Presencial', 'Desde S/ 120 por equipo', 'APROBADO'),
    (2, 1, 'Diagnóstico e Instalación de Software Corporativo', 'Instalación y configuración de sistemas operativos, antivirus, utilitarios de oficina y resolución de conflictos de software.', 'Soporte técnico', 'Remoto / Presencial', 'Desde S/ 80', 'APROBADO'),
    (3, 2, 'Cableado Estructurado y Certificación Cat 6A', 'Instalación de puntos de red, ordenamiento de patch panels, canalización y certificación de reflectometría.', 'Redes e infraestructura', 'Presencial', 'A cotizar según puntos', 'APROBADO'),
    (4, 2, 'Configuración de Routers y Mantenimiento de Servidores', 'Configuración de balanceo de carga, VPNs seguras, switches administrables y mantenimiento físico de racks.', 'Redes e infraestructura', 'Híbrido', 'Desde S/ 350', 'APROBADO'),
    (5, 3, 'Auditoría de Seguridad y Análisis de Vulnerabilidades', 'Escaneo exhaustivo de puertos, detección de brechas en redes corporativas y reporte ejecutivo con plan de mitigación.', 'Ciberseguridad', 'Remoto', 'Desde S/ 850', 'APROBADO'),
    (6, 3, 'Configuración de Firewalls y Copias de Seguridad', 'Implementación de reglas de acceso, bloqueo de malware en frontera y automatización de backups 3-2-1 cifrados.', 'Ciberseguridad', 'Remoto / Presencial', 'Desde S/ 450 mensual', 'APROBADO'),
    (7, 4, 'Asesoría y Consultoría en Arquitectura TI', 'Evaluación del estado tecnológico actual, formulación de hoja de ruta tecnológica y optimización de costos.', 'Consultoría tecnológica', 'Remoto', 'A cotizar por horas', 'APROBADO'),
    (8, 4, 'Implementación y Capacitación de Herramientas Digitales', 'Acompañamiento en la puesta en marcha de soluciones de gestión y entrenamiento al equipo comercial.', 'Consultoría tecnológica', 'Híbrido', 'Desde S/ 600', 'APROBADO'),
    (9, 5, 'Migración de Servidores a la Nube', 'Traslado de cargas de trabajo locales a entornos cloud optimizados para alta disponibilidad.', 'Consultoría tecnológica', 'Remoto', 'A cotizar', 'PENDIENTE')
    ON DUPLICATE KEY UPDATE nombre = VALUES(nombre);
  `;

  try {
    await db.query(sqlEmpresas);
    console.log('[Seed] ✓ 5 Empresas registradas en MySQL (4 aprobadas, 1 pendiente).');
    await db.query(sqlServicios);
    console.log('[Seed] ✓ 9 Servicios registrados en MySQL (8 aprobados, 1 pendiente).');
    console.log('[Seed] Datos iniciales preparados exitosamente en la base de datos MySQL.');
    process.exit(0);
  } catch (error) {
    console.error('[Seed] Error al poblar datos en MySQL:', error);
    process.exit(1);
  }
}

seedDatabase();
