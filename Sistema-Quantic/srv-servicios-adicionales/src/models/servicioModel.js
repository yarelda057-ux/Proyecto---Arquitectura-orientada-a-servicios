                                                                                
                                    
                                                          
                                                                                

const db = require('../config/db');

                                                                             
let memoriaServicios = [
  {
    id: 1,
    empresa_id: 1,
    nombre: 'Reparación y Mantenimiento de Computadoras',
    descripcion: 'Limpieza profunda de hardware, cambio de pasta térmica, diagnóstico de fallas y sustitución de piezas defectuosas.',
    categoria: 'Soporte técnico',
    tipo_servicio: 'Presencial',
    precio_referencial: 'Desde S/ 120 por equipo',
    estado: 'APROBADO',
    created_at: '2026-10-01 10:00:00'
  },
  {
    id: 2,
    empresa_id: 1,
    nombre: 'Diagnóstico e Instalación de Software Corporativo',
    descripcion: 'Instalación y configuración de sistemas operativos, antivirus, utilitarios de oficina y resolución de conflictos de software.',
    categoria: 'Soporte técnico',
    tipo_servicio: 'Remoto / Presencial',
    precio_referencial: 'Desde S/ 80',
    estado: 'APROBADO',
    created_at: '2026-10-01 10:30:00'
  },
  {
    id: 3,
    empresa_id: 2,
    nombre: 'Cableado Estructurado y Certificación Cat 6A',
    descripcion: 'Instalación de puntos de red, ordenamiento de patch panels, canalización y certificación de reflectometría.',
    categoria: 'Redes e infraestructura',
    tipo_servicio: 'Presencial',
    precio_referencial: 'A cotizar según puntos',
    estado: 'APROBADO',
    created_at: '2026-10-02 11:00:00'
  },
  {
    id: 4,
    empresa_id: 2,
    nombre: 'Configuración de Routers y Mantenimiento de Servidores',
    descripcion: 'Configuración de balanceo de carga, VPNs seguras, switches administrables y mantenimiento físico de racks.',
    categoria: 'Redes e infraestructura',
    tipo_servicio: 'Híbrido',
    precio_referencial: 'Desde S/ 350',
    estado: 'APROBADO',
    created_at: '2026-10-02 11:45:00'
  },
  {
    id: 5,
    empresa_id: 3,
    nombre: 'Auditoría de Seguridad y Análisis de Vulnerabilidades',
    descripcion: 'Escaneo exhaustivo de puertos, detección de brechas en redes corporativas y reporte ejecutivo con plan de mitigación.',
    categoria: 'Ciberseguridad',
    tipo_servicio: 'Remoto',
    precio_referencial: 'Desde S/ 850',
    estado: 'APROBADO',
    created_at: '2026-10-03 14:30:00'
  },
  {
    id: 6,
    empresa_id: 3,
    nombre: 'Configuración de Firewalls y Copias de Seguridad',
    descripcion: 'Implementación de reglas de acceso, bloqueo de malware en frontera y automatización de backups 3-2-1 cifrados.',
    categoria: 'Ciberseguridad',
    tipo_servicio: 'Remoto / Presencial',
    precio_referencial: 'Desde S/ 450 mensual',
    estado: 'APROBADO',
    created_at: '2026-10-03 15:00:00'
  },
  {
    id: 7,
    empresa_id: 4,
    nombre: 'Asesoría y Consultoría en Arquitectura TI',
    descripcion: 'Evaluación del estado tecnológico actual, formulación de hoja de ruta tecnológica y optimización de costos.',
    categoria: 'Consultoría tecnológica',
    tipo_servicio: 'Remoto',
    precio_referencial: 'A cotizar por horas',
    estado: 'APROBADO',
    created_at: '2026-10-04 10:30:00'
  },
  {
    id: 8,
    empresa_id: 4,
    nombre: 'Implementación y Capacitación de Herramientas Digitales',
    descripcion: 'Acompañamiento en la puesta en marcha de soluciones de gestión y entrenamiento al equipo comercial.',
    categoria: 'Consultoría tecnológica',
    tipo_servicio: 'Híbrido',
    precio_referencial: 'Desde S/ 600',
    estado: 'APROBADO',
    created_at: '2026-10-04 11:00:00'
  },
  {
    id: 9,
    empresa_id: 5,
    nombre: 'Migración de Servidores a la Nube',
    descripcion: 'Traslado de cargas de trabajo locales a entornos cloud optimizados para alta disponibilidad.',
    categoria: 'Consultoría tecnológica',
    tipo_servicio: 'Remoto',
    precio_referencial: 'A cotizar',
    estado: 'PENDIENTE',
    created_at: '2026-10-08 15:30:00'
  }
];

let nextServicioId = 10;

class ServicioModel {
                                                                               
  static async create({ empresa_id, nombre, descripcion, categoria, tipo_servicio, precio_referencial }) {
    const tipo = tipo_servicio || 'Híbrido (Presencial/Remoto)';
    const precio = precio_referencial || 'A cotizar';

    if (db.isMySQLConnected()) {
      const sql = `
        INSERT INTO servicios (empresa_id, nombre, descripcion, categoria, tipo_servicio, precio_referencial, estado)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDIENTE')
      `;
      const result = await db.query(sql, [
        empresa_id,
        nombre,
        descripcion,
        categoria,
        tipo,
        precio
      ]);
      return {
        id: result.insertId,
        empresa_id,
        nombre,
        descripcion,
        categoria,
        tipo_servicio: tipo,
        precio_referencial: precio,
        estado: 'PENDIENTE'
      };
    }

                                   
    const nuevoServicio = {
      id: nextServicioId++,
      empresa_id: parseInt(empresa_id, 10),
      nombre,
      descripcion,
      categoria,
      tipo_servicio: tipo,
      precio_referencial: precio,
      estado: 'PENDIENTE',
      created_at: new Date().toISOString()
    };
    memoriaServicios.push(nuevoServicio);
    return nuevoServicio;
  }

                                                                                                
  static async getPublicos({ categoria, q, ciudad, tipo_servicio } = {}, EmpresaModelRef) {
    if (db.isMySQLConnected()) {
      let sql = `
        SELECT 
          s.id, s.empresa_id, s.nombre, s.descripcion, s.categoria, 
          s.tipo_servicio, s.precio_referencial, s.estado, s.created_at,
          e.razon_social AS empresa_razon_social,
          e.ruc AS empresa_ruc,
          e.ciudad AS empresa_ciudad,
          e.telefono AS empresa_telefono,
          e.email_contacto AS empresa_email,
          e.sitio_web AS empresa_sitio_web,
          e.direccion AS empresa_direccion
        FROM servicios s
        INNER JOIN empresas e ON s.empresa_id = e.id
        WHERE s.estado = 'APROBADO' AND e.estado_verificacion = 'APROBADO'
      `;
      const params = [];

      if (categoria) {
        sql += ` AND LOWER(s.categoria) = LOWER(?)`;
        params.push(categoria);
      }

      if (ciudad) {
        sql += ` AND LOWER(e.ciudad) = LOWER(?)`;
        params.push(ciudad);
      }

      if (tipo_servicio) {
        sql += ` AND LOWER(s.tipo_servicio) LIKE LOWER(?)`;
        params.push(`%${tipo_servicio}%`);
      }

      if (q) {
        sql += ` AND (LOWER(s.nombre) LIKE LOWER(?) OR LOWER(s.descripcion) LIKE LOWER(?) OR LOWER(e.razon_social) LIKE LOWER(?))`;
        params.push(`%${q}%`, `%${q}%`, `%${q}%`);
      }

      sql += ` ORDER BY s.categoria ASC, s.nombre ASC`;
      return await db.query(sql, params);
    }

                   
    const normalize = (str) => (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    const empresasAprobadas = await EmpresaModelRef.getAprobadas();
    const empresasMap = new Map(empresasAprobadas.map(e => [e.id, e]));

    return memoriaServicios
      .filter(s => s.estado === 'APROBADO' && empresasMap.has(s.empresa_id))
      .map(s => {
        const emp = empresasMap.get(s.empresa_id);
        return {
          ...s,
          empresa_razon_social: emp.razon_social,
          empresa_ruc: emp.ruc,
          empresa_ciudad: emp.ciudad,
          empresa_telefono: emp.telefono,
          empresa_email: emp.email_contacto,
          empresa_sitio_web: emp.sitio_web,
          empresa_direccion: emp.direccion
        };
      })
      .filter(s => {
        if (categoria && normalize(s.categoria) !== normalize(categoria)) return false;
        if (ciudad && normalize(s.empresa_ciudad) !== normalize(ciudad)) return false;
        if (tipo_servicio && !normalize(s.tipo_servicio).includes(normalize(tipo_servicio))) return false;
        if (q) {
          const normQ = normalize(q);
          const matchNom = normalize(s.nombre).includes(normQ);
          const matchDesc = normalize(s.descripcion).includes(normQ);
          const matchEmp = normalize(s.empresa_razon_social).includes(normQ);
          if (!matchNom && !matchDesc && !matchEmp) return false;
        }
        return true;
      });
  }

                                        
  static async getByEmpresaId(empresaId, soloAprobados = true) {
    if (db.isMySQLConnected()) {
      let sql = `SELECT * FROM servicios WHERE empresa_id = ?`;
      const params = [empresaId];
      if (soloAprobados) {
        sql += ` AND estado = 'APROBADO'`;
      }
      sql += ` ORDER BY nombre ASC`;
      return await db.query(sql, params);
    }

    return memoriaServicios
      .filter(s => s.empresa_id === parseInt(empresaId, 10))
      .filter(s => (soloAprobados ? s.estado === 'APROBADO' : true));
  }

                            
  static async getById(id) {
    if (db.isMySQLConnected()) {
      const rows = await db.query(`SELECT * FROM servicios WHERE id = ?`, [id]);
      return rows[0] || null;
    }
    return memoriaServicios.find(s => s.id === parseInt(id, 10)) || null;
  }

                                                           
  static async getTodos({ estado, empresa_id } = {}) {
    if (db.isMySQLConnected()) {
      let sql = `
        SELECT s.*, e.razon_social AS empresa_razon_social
        FROM servicios s
        INNER JOIN empresas e ON s.empresa_id = e.id
        WHERE 1=1
      `;
      const params = [];
      if (estado) {
        sql += ` AND s.estado = ?`;
        params.push(estado);
      }
      if (empresa_id) {
        sql += ` AND s.empresa_id = ?`;
        params.push(empresa_id);
      }
      sql += ` ORDER BY s.created_at DESC`;
      return await db.query(sql, params);
    }

    let resultado = memoriaServicios.map(s => ({ ...s }));
    if (estado) {
      resultado = resultado.filter(s => s.estado === estado);
    }
    if (empresa_id) {
      resultado = resultado.filter(s => s.empresa_id === parseInt(empresa_id, 10));
    }
    return resultado;
  }

                                     
  static async updateEstado(id, nuevoEstado) {
    if (db.isMySQLConnected()) {
      await db.query(`UPDATE servicios SET estado = ? WHERE id = ?`, [nuevoEstado, id]);
      return this.getById(id);
    }

    const index = memoriaServicios.findIndex(s => s.id === parseInt(id, 10));
    if (index === -1) return null;
    memoriaServicios[index].estado = nuevoEstado;
    return memoriaServicios[index];
  }

                                                                                        
  static async updateEstadoPorEmpresa(empresaId, nuevoEstado) {
    if (db.isMySQLConnected()) {
      await db.query(`UPDATE servicios SET estado = ? WHERE empresa_id = ?`, [nuevoEstado, empresaId]);
      return true;
    }

    memoriaServicios.forEach(s => {
      if (s.empresa_id === parseInt(empresaId, 10)) {
        s.estado = nuevoEstado;
      }
    });
    return true;
  }

                                                                                        
  static async updateDatos(id, { nombre, categoria, tipo_servicio, precio_referencial, descripcion }) {
    if (db.isMySQLConnected()) {
      await db.query(
        `UPDATE servicios 
         SET nombre = COALESCE(?, nombre),
             categoria = COALESCE(?, categoria),
             tipo_servicio = COALESCE(?, tipo_servicio),
             precio_referencial = COALESCE(?, precio_referencial),
             descripcion = COALESCE(?, descripcion)
         WHERE id = ?`,
        [nombre || null, categoria || null, tipo_servicio || null, precio_referencial || null, descripcion || null, id]
      );
      return this.getById(id);
    }

    const index = memoriaServicios.findIndex(s => s.id === parseInt(id, 10));
    if (index === -1) return null;

    if (nombre !== undefined) memoriaServicios[index].nombre = nombre;
    if (categoria !== undefined) memoriaServicios[index].categoria = categoria;
    if (tipo_servicio !== undefined) memoriaServicios[index].tipo_servicio = tipo_servicio;
    if (precio_referencial !== undefined) memoriaServicios[index].precio_referencial = precio_referencial;
    if (descripcion !== undefined) memoriaServicios[index].descripcion = descripcion;
    return memoriaServicios[index];
  }
}

module.exports = ServicioModel;
