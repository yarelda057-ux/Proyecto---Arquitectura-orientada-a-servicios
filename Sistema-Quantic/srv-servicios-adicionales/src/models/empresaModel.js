// =============================================================================
// MODELO / REPOSITORIO DE EMPRESAS
// Microservicio: SRV-G5202605 - Quantic Technology S.A.C.
// =============================================================================

const db = require('../config/db');

// Datos de demostración en memoria para cuando MySQL aún no está configurado
let memoriaEmpresas = [
  {
    id: 1,
    razon_social: 'TechFix Soluciones Digitales [DEMO]',
    ruc: '20601234561',
    email_contacto: 'contacto@techfix-demo.pe',
    telefono: '+51 987 654 321',
    sitio_web: 'https://techfix-demo.pe',
    direccion: 'Av. Javier Prado Este 2450, San Borja',
    ciudad: 'Lima',
    descripcion: 'Especialistas en soporte computacional, mantenimiento preventivo y recuperación operativa para empresas.',
    estado_verificacion: 'APROBADO',
    fecha_revision: '2026-10-01 10:00:00',
    notas_revision: 'Aprobado en revisión técnica inicial.',
    created_at: '2026-10-01 09:00:00'
  },
  {
    id: 2,
    razon_social: 'ConectaRedes del Perú [DEMO]',
    ruc: '20602345672',
    email_contacto: 'proyectos@conectaredes-demo.pe',
    telefono: '+51 976 543 210',
    sitio_web: 'https://conectaredes-demo.pe',
    direccion: 'Calle Los Sauces 114, Yanahuara',
    ciudad: 'Arequipa',
    descripcion: 'Diseño, cableado estructurado certificado e infraestructura de enlaces de red de alta velocidad.',
    estado_verificacion: 'APROBADO',
    fecha_revision: '2026-10-02 11:30:00',
    notas_revision: 'Documentación y experiencia verificadas.',
    created_at: '2026-10-02 08:30:00'
  },
  {
    id: 3,
    razon_social: 'CiberShield Protec [DEMO]',
    ruc: '20603456783',
    email_contacto: 'seguridad@cibershield-demo.pe',
    telefono: '+51 965 432 109',
    sitio_web: 'https://cibershield-demo.pe',
    direccion: 'Av. San Martín 880, Miraflores',
    ciudad: 'Lima',
    descripcion: 'Soluciones de blindaje perimetral, auditorías de vulnerabilidad y políticas de copias de seguridad.',
    estado_verificacion: 'APROBADO',
    fecha_revision: '2026-10-03 16:45:00',
    notas_revision: 'Cumple con estándares de ciberseguridad requeridos.',
    created_at: '2026-10-03 14:00:00'
  },
  {
    id: 4,
    razon_social: 'InnovaTech Consultores [DEMO]',
    ruc: '20604567894',
    email_contacto: 'info@innovatech-demo.pe',
    telefono: '+51 954 321 098',
    sitio_web: 'https://innovatech-demo.pe',
    direccion: 'Jr. Pizarro 420, Centro Histórico',
    ciudad: 'Trujillo',
    descripcion: 'Asesoría estratégica en transformación digital, modernización de software e integración de procesos.',
    estado_verificacion: 'APROBADO',
    fecha_revision: '2026-10-04 12:10:00',
    notas_revision: 'Verificación completa.',
    created_at: '2026-10-04 10:15:00'
  },
  {
    id: 5,
    razon_social: 'Sistemas Cloud Andina [DEMO - PENDIENTE]',
    ruc: '20605678905',
    email_contacto: 'hola@cloudandina-demo.pe',
    telefono: '+51 943 210 987',
    sitio_web: 'https://cloudandina-demo.pe',
    direccion: 'Av. El Sol 340',
    ciudad: 'Cusco',
    descripcion: 'Migración e infraestructura en la nube para mypes y empresas comerciales.',
    estado_verificacion: 'PENDIENTE',
    fecha_revision: null,
    notas_revision: null,
    created_at: '2026-10-08 15:20:00'
  }
];

memoriaEmpresas.forEach(company => Object.assign(company, { ofrece_servicios: true, provee_equipos: false }));
let nextEmpresaId = 6;

class EmpresaModel {
  // Crear una nueva empresa (Siempre nace con estado 'PENDIENTE')
  static async create({ razon_social, ruc, email_contacto, telefono, sitio_web, direccion, ciudad, descripcion, ofrece_servicios = true, provee_equipos = false }) {
    if (db.isMySQLConnected()) {
      const sql = `
        INSERT INTO empresas (razon_social, ruc, email_contacto, telefono, sitio_web, direccion, ciudad, descripcion, ofrece_servicios, provee_equipos, estado_verificacion)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE')
      `;
      const result = await db.query(sql, [
        razon_social,
        ruc,
        email_contacto,
        telefono,
        sitio_web || null,
        direccion || null,
        ciudad || 'Lima',
        descripcion || null, ofrece_servicios, provee_equipos
      ]);
      return {
        id: result.insertId,
        ofrece_servicios, provee_equipos,
        razon_social,
        ruc,
        email_contacto,
        telefono,
        sitio_web,
        direccion,
        ciudad: ciudad || 'Lima',
        descripcion,
        estado_verificacion: 'PENDIENTE'
      };
    }

    // Modo Demostración en memoria
    const nuevaEmpresa = {
      id: nextEmpresaId++,
      ofrece_servicios, provee_equipos,
      razon_social,
      ruc,
      email_contacto,
      telefono,
      sitio_web: sitio_web || null,
      direccion: direccion || null,
      ciudad: ciudad || 'Lima',
      descripcion: descripcion || null,
      estado_verificacion: 'PENDIENTE',
      fecha_revision: null,
      notas_revision: null,
      created_at: new Date().toISOString()
    };
    memoriaEmpresas.push(nuevaEmpresa);
    return nuevaEmpresa;
  }

  // Obtener solo empresas aprobadas para el directorio público
  static async getAprobadas({ q, ciudad } = {}) {
    if (db.isMySQLConnected()) {
      let sql = `
        SELECT e.*, COUNT(s.id) as cantidad_servicios
        FROM empresas e
        LEFT JOIN servicios s ON e.id = s.empresa_id AND s.estado = 'APROBADO'
        WHERE e.estado_verificacion = 'APROBADO'
      `;
      const params = [];

      if (ciudad) {
        sql += ` AND LOWER(e.ciudad) = LOWER(?)`;
        params.push(ciudad);
      }

      if (q) {
        sql += ` AND (LOWER(e.razon_social) LIKE LOWER(?) OR LOWER(e.descripcion) LIKE LOWER(?))`;
        params.push(`%${q}%`, `%${q}%`);
      }

      sql += ` GROUP BY e.id ORDER BY e.razon_social ASC`;

      return await db.query(sql, params);
    }

    // Modo Memoria
    const normalize = (str) => (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    return memoriaEmpresas
      .filter(e => e.estado_verificacion === 'APROBADO')
      .filter(e => {
        if (ciudad && normalize(e.ciudad) !== normalize(ciudad)) return false;
        if (q) {
          const normQ = normalize(q);
          const matchRazon = normalize(e.razon_social).includes(normQ);
          const matchDesc = normalize(e.descripcion).includes(normQ);
          if (!matchRazon && !matchDesc) return false;
        }
        return true;
      });
  }

  // Obtener una empresa por ID
  static async getById(id) {
    if (db.isMySQLConnected()) {
      const rows = await db.query(`SELECT * FROM empresas WHERE id = ?`, [id]);
      return rows[0] || null;
    }

    return memoriaEmpresas.find(e => e.id === parseInt(id, 10)) || null;
  }

  // Obtener empresa por RUC (para evitar duplicados)
  static async getByRuc(ruc) {
    if (db.isMySQLConnected()) {
      const rows = await db.query(`SELECT * FROM empresas WHERE ruc = ?`, [ruc]);
      return rows[0] || null;
    }

    return memoriaEmpresas.find(e => e.ruc === ruc) || null;
  }

  // Obtener todas las solicitudes (incluye PENDIENTES, APROBADAS, RECHAZADAS) - Para demostración de administración
  static async getTodasLasSolicitudes({ estado } = {}) {
    if (db.isMySQLConnected()) {
      let sql = `SELECT * FROM empresas`;
      const params = [];
      if (estado) {
        sql += ` WHERE estado_verificacion = ?`;
        params.push(estado);
      }
      sql += ` ORDER BY created_at DESC`;
      return await db.query(sql, params);
    }

    let resultado = [...memoriaEmpresas];
    if (estado) {
      resultado = resultado.filter(e => e.estado_verificacion === estado);
    }
    return resultado.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  // Actualizar estado de verificación (Aprobación / Rechazo)
  static async updateEstado(id, nuevoEstado, notas = '') {
    const fecha = new Date().toISOString().slice(0, 19).replace('T', ' ');

    if (db.isMySQLConnected()) {
      await db.query(
        `UPDATE empresas SET estado_verificacion = ?, fecha_revision = NOW(), notas_revision = ? WHERE id = ?`,
        [nuevoEstado, notas, id]
      );
      return this.getById(id);
    }

    const index = memoriaEmpresas.findIndex(e => e.id === parseInt(id, 10));
    if (index === -1) return null;

    memoriaEmpresas[index].estado_verificacion = nuevoEstado;
    memoriaEmpresas[index].fecha_revision = fecha;
    memoriaEmpresas[index].notas_revision = notas;
    return memoriaEmpresas[index];
  }

  // Actualizar datos comerciales de la empresa (para autogestión de la empresa)
  static async updateDatos(id, { telefono, direccion, ciudad, sitio_web, descripcion }) {
    if (db.isMySQLConnected()) {
      await db.query(
        `UPDATE empresas 
         SET telefono = COALESCE(?, telefono),
             direccion = COALESCE(?, direccion),
             ciudad = COALESCE(?, ciudad),
             sitio_web = COALESCE(?, sitio_web),
             descripcion = COALESCE(?, descripcion)
         WHERE id = ?`,
        [telefono || null, direccion || null, ciudad || null, sitio_web || null, descripcion || null, id]
      );
      return this.getById(id);
    }

    const index = memoriaEmpresas.findIndex(e => e.id === parseInt(id, 10));
    if (index === -1) return null;

    if (telefono !== undefined) memoriaEmpresas[index].telefono = telefono;
    if (direccion !== undefined) memoriaEmpresas[index].direccion = direccion;
    if (ciudad !== undefined) memoriaEmpresas[index].ciudad = ciudad;
    if (sitio_web !== undefined) memoriaEmpresas[index].sitio_web = sitio_web;
    if (descripcion !== undefined) memoriaEmpresas[index].descripcion = descripcion;
    return memoriaEmpresas[index];
  }
}

module.exports = EmpresaModel;
