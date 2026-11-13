-- =============================================================================
-- ESQUEMA DE BASE DE DATOS MYSQL - QUANTIC TECHNOLOGY S.A.C.
-- Microservicio: Servicio de Consulta de Servicios Adicionales (SRV-G5202605)
-- Base de Datos: quantic_servicios_db
-- =============================================================================

-- 1. Creación de la base de datos si no existe
CREATE DATABASE IF NOT EXISTS quantic_servicios_db 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE quantic_servicios_db;

-- -----------------------------------------------------------------------------
-- 2. Tabla: empresas
-- Almacena empresas proveedoras tecnológicas con RUC peruano y datos de contacto.
-- Estados posibles:
--   - PENDIENTE: Solicitud recién enviada, en espera de revisión.
--   - APROBADO: Empresa verificada y visible en el directorio.
--   - RECHAZADO: Solicitud desestimada.
--   - INACTIVO: Empresa inhabilitada/pausada temporalmente por la administración o la empresa.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS empresas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  razon_social VARCHAR(150) NOT NULL,
  ruc VARCHAR(11) NOT NULL UNIQUE,
  email_contacto VARCHAR(120) NOT NULL,
  telefono VARCHAR(30) NOT NULL,
  sitio_web VARCHAR(200) NULL,
  direccion VARCHAR(250) NULL,
  ciudad VARCHAR(80) NOT NULL DEFAULT 'Lima',
  descripcion TEXT NULL,
  estado_verificacion ENUM('PENDIENTE', 'APROBADO', 'RECHAZADO', 'INACTIVO') NOT NULL DEFAULT 'PENDIENTE',
  fecha_solicitud TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_revision TIMESTAMP NULL DEFAULT NULL,
  notas_revision TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_empresas_ruc (ruc),
  INDEX idx_empresas_estado (estado_verificacion),
  INDEX idx_empresas_ciudad (ciudad)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 3. Tabla: servicios
-- Almacena el catálogo de servicios asociados a cada empresa proveedora.
-- Estados posibles:
--   - PENDIENTE: Servicio nuevo en espera de aprobación.
--   - APROBADO: Publicado activamente en el catálogo.
--   - INACTIVO: Inhabilitado / pausado temporalmente (no aparece en catálogo público).
--   - RECHAZADO: Oferta no autorizada.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS servicios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  empresa_id INT NOT NULL,
  nombre VARCHAR(160) NOT NULL,
  descripcion TEXT NOT NULL,
  categoria VARCHAR(100) NOT NULL,
  tipo_servicio VARCHAR(60) NOT NULL DEFAULT 'Presencial',
  precio_referencial VARCHAR(80) NULL DEFAULT 'A cotizar',
  estado ENUM('PENDIENTE', 'APROBADO', 'RECHAZADO', 'INACTIVO') NOT NULL DEFAULT 'PENDIENTE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_servicios_empresa 
    FOREIGN KEY (empresa_id) 
    REFERENCES empresas (id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
  INDEX idx_servicios_empresa (empresa_id),
  INDEX idx_servicios_categoria (categoria),
  INDEX idx_servicios_estado (estado),
  INDEX idx_servicios_tipo (tipo_servicio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 4. Datos Iniciales de Demostración (Seed Data)
-- -----------------------------------------------------------------------------
INSERT INTO empresas (id, razon_social, ruc, email_contacto, telefono, sitio_web, direccion, ciudad, descripcion, estado_verificacion, fecha_revision, notas_revision)
VALUES 
(1, 'TechFix Soluciones Digitales [DEMO]', '20601234561', 'contacto@techfix-demo.pe', '+51 987 654 321', 'https://techfix-demo.pe', 'Av. Javier Prado Este 2450, San Borja', 'Lima', 'Especialistas en soporte computacional, mantenimiento preventivo y recuperación operativa para empresas.', 'APROBADO', NOW(), 'Aprobado en revisión técnica inicial.'),
(2, 'ConectaRedes del Perú [DEMO]', '20602345672', 'proyectos@conectaredes-demo.pe', '+51 976 543 210', 'https://conectaredes-demo.pe', 'Calle Los Sauces 114, Yanahuara', 'Arequipa', 'Diseño, cableado estructurado certificado e infraestructura de enlaces de red de alta velocidad.', 'APROBADO', NOW(), 'Documentación y experiencia verificadas.'),
(3, 'CiberShield Protec [DEMO]', '20603456783', 'seguridad@cibershield-demo.pe', '+51 965 432 109', 'https://cibershield-demo.pe', 'Av. San Martín 880, Miraflores', 'Lima', 'Soluciones de blindaje perimetral, auditorías de vulnerabilidad y políticas de copias de seguridad.', 'APROBADO', NOW(), 'Cumple con estándares de ciberseguridad requeridos.'),
(4, 'InnovaTech Consultores [DEMO]', '20604567894', 'info@innovatech-demo.pe', '+51 954 321 098', 'https://innovatech-demo.pe', 'Jr. Pizarro 420, Centro Histórico', 'Trujillo', 'Asesoría estratégica en transformación digital, modernización de software e integración de procesos.', 'APROBADO', NOW(), 'Verificación completa.'),
(5, 'Sistemas Cloud Andina [DEMO - PENDIENTE]', '20605678905', 'hola@cloudandina-demo.pe', '+51 943 210 987', 'https://cloudandina-demo.pe', 'Av. El Sol 340', 'Cusco', 'Migración e infraestructura en la nube para mypes y empresas comerciales.', 'PENDIENTE', NULL, NULL)
ON DUPLICATE KEY UPDATE razon_social = VALUES(razon_social);

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
