// =============================================================================
// CONTROLADOR DE EMPRESAS
// Microservicio: SRV-G5202605 - Quantic Technology S.A.C.
// =============================================================================

const EmpresaModel = require('../models/empresaModel');
const ServicioModel = require('../models/servicioModel');

class EmpresasController {
  /**
   * POST /api/v1/catalogo/empresas
   * Registra una nueva solicitud de empresa proveedora.
   * Flujo de negocio: Se guarda inicialmente con estado 'PENDIENTE'.
   */
  static async registrarEmpresa(req, res) {
    try {
      const flags = require('../companyRegistry').capabilities({ ofrece_servicios: req.body.ofrece_servicios ?? true, provee_equipos: req.body.provee_equipos ?? false });
      if (!flags.ofrece_servicios && req.body.servicios_iniciales?.length) return res.status(400).json({ mensaje: 'Una empresa de equipos no puede registrar servicios sin seleccionar esa actividad.' });
      const {
        razon_social,
        ruc,
        email_contacto,
        telefono,
        sitio_web,
        direccion,
        ciudad,
        descripcion,
        servicios_iniciales // Array opcional de servicios enviados con la solicitud
      } = req.body;

      // 1. Validaciones básicas de campos obligatorios
      if (!razon_social || !ruc || !email_contacto || !telefono) {
        return res.status(400).json({
          status: 'error',
          codigo: 400,
          mensaje: 'Faltan campos obligatorios. Se requiere: razon_social, ruc, email_contacto y telefono.'
        });
      }

      // Validación de formato de RUC en el Perú (11 dígitos, inicia con 10, 15, 17 o 20 - SUNAT)
      const rucLimpio = ruc.trim();
      if (!/^\d{11}$/.test(rucLimpio)) {
        return res.status(400).json({
          status: 'error',
          codigo: 400,
          mensaje: 'El RUC debe tener exactamente 11 dígitos numéricos según la normativa de SUNAT (Perú).'
        });
      }
      if (!/^(10|15|17|20)\d{9}$/.test(rucLimpio)) {
        return res.status(400).json({
          status: 'error',
          codigo: 400,
          mensaje: 'El RUC ingresado no cumple con el prefijo oficial en Perú. Debe iniciar con 10 (persona natural con negocio) o 20 (persona jurídica S.A.C., S.R.L., etc.).'
        });
      }

      // Validación simple de email
      if (!email_contacto.includes('@') || !email_contacto.includes('.')) {
        return res.status(400).json({
          status: 'error',
          codigo: 400,
          mensaje: 'El correo electrónico de contacto no tiene un formato válido.'
        });
      }

      // 2. Verificar que no exista una empresa con el mismo RUC
      const empresaExistente = await EmpresaModel.getByRuc(ruc.trim());
      if (empresaExistente) {
        return res.status(400).json({
          status: 'error',
          codigo: 400,
          mensaje: `Ya existe una solicitud o empresa registrada con el RUC ${ruc.trim()}.`
        });
      }

      // 3. Crear empresa en estado PENDIENTE
      const nuevaEmpresa = await EmpresaModel.create({
        ...flags,
        razon_social: razon_social.trim(),
        ruc: ruc.trim(),
        email_contacto: email_contacto.trim(),
        telefono: telefono.trim(),
        sitio_web: sitio_web ? sitio_web.trim() : null,
        direccion: direccion ? direccion.trim() : null,
        ciudad: ciudad ? ciudad.trim() : 'Lima',
        descripcion: descripcion ? descripcion.trim() : null
      });

      // 4. Si se enviaron servicios iniciales junto a la solicitud, registrarlos como PENDIENTES
      const serviciosCreados = [];
      if (Array.isArray(servicios_iniciales) && servicios_iniciales.length > 0) {
        for (const s of servicios_iniciales) {
          if (s.nombre && s.categoria) {
            const nuevoSrv = await ServicioModel.create({
              empresa_id: nuevaEmpresa.id,
              nombre: s.nombre.trim(),
              descripcion: s.descripcion ? s.descripcion.trim() : 'Sin descripción detallada',
              categoria: s.categoria.trim(),
              tipo_servicio: s.tipo_servicio ? s.tipo_servicio.trim() : 'Presencial / Remoto',
              precio_referencial: s.precio_referencial ? s.precio_referencial.trim() : 'A cotizar'
            });
            serviciosCreados.push(nuevoSrv);
          }
        }
      }

      return res.status(201).json({
        status: 'success',
        codigo: 201,
        mensaje: 'Solicitud de registro enviada exitosamente. Se encuentra en estado PENDIENTE de verificación administrativa.',
        datos: {
          empresa: nuevaEmpresa,
          servicios_adjuntos: serviciosCreados
        }
      });
    } catch (error) {
      if (error.status) return res.status(error.status).json({ mensaje: error.message });
      console.error('[EmpresasController.registrarEmpresa] Error:', error);
      return res.status(500).json({
        status: 'error',
        codigo: 500,
        mensaje: 'Error interno en el servidor al registrar la empresa.'
      });
    }
  }

  /**
   * GET /api/v1/catalogo/empresas
   * Consulta pública de empresas verificadas y aprobadas.
   * Parámetros de consulta opcionales:
   *  - q: Búsqueda por texto en razón social o descripción
   *  - ciudad: Filtrado por ciudad (ej: Lima, Arequipa, Trujillo)
   */
  static async obtenerEmpresas(req, res) {
    try {
      const { q, ciudad } = req.query;

      const empresas = await EmpresaModel.getAprobadas({ q, ciudad });

      return res.status(200).json({
        status: 'success',
        codigo: 200,
        total: empresas.length,
        filtros_aplicados: {
          q: q || null,
          ciudad: ciudad || null
        },
        datos: empresas
      });
    } catch (error) {
      console.error('[EmpresasController.obtenerEmpresas] Error:', error);
      return res.status(500).json({
        status: 'error',
        codigo: 500,
        mensaje: 'Error interno al consultar el catálogo de empresas.'
      });
    }
  }

  /**
   * GET /api/v1/catalogo/empresas/:id
   * Consulta el detalle de una empresa y sus servicios aprobados.
   */
  static async obtenerEmpresaPorId(req, res) {
    try {
      const { id } = req.params;
      const empresa = await EmpresaModel.getById(id);

      if (!empresa || empresa.estado_verificacion !== 'APROBADO') {
        return res.status(404).json({
          status: 'error',
          codigo: 404,
          mensaje: 'Empresa no encontrada o aún no ha sido aprobada en el catálogo.'
        });
      }

      const servicios = empresa.ofrece_servicios ? await ServicioModel.getByEmpresaId(empresa.id, true) : [];

      return res.status(200).json({
        status: 'success',
        codigo: 200,
        datos: {
          ...empresa,
          servicios
        }
      });
    } catch (error) {
      console.error('[EmpresasController.obtenerEmpresaPorId] Error:', error);
      return res.status(500).json({
        status: 'error',
        codigo: 500,
        mensaje: 'Error interno al consultar la empresa solicitada.'
      });
    }
  }

  /**
   * GET /api/v1/catalogo/empresas/perfil/ruc/:ruc
   * Acceso para que una empresa consulte su propio perfil y todos sus servicios (Portal Proveedor)
   */
  static async obtenerPerfilPorRuc(req, res) {
    try {
      const { ruc } = req.params;
      const empresa = await EmpresaModel.getByRuc(ruc.trim());

      if (!empresa) {
        return res.status(404).json({
          status: 'error',
          codigo: 404,
          mensaje: `No se encontró ninguna empresa registrada con el RUC ${ruc}. Verifique el número o regístrese primero.`
        });
      }

      // La empresa en su portal privado puede ver TODOS sus servicios (aprobados, pendientes e inactivos)
      const servicios = await ServicioModel.getByEmpresaId(empresa.id, false);

      return res.status(200).json({
        status: 'success',
        codigo: 200,
        mensaje: `Acceso al Portal de Proveedor concedido para ${empresa.razon_social}.`,
        datos: {
          ...empresa,
          servicios
        }
      });
    } catch (error) {
      console.error('[EmpresasController.obtenerPerfilPorRuc] Error:', error);
      return res.status(500).json({
        status: 'error',
        codigo: 500,
        mensaje: 'Error al consultar el perfil de la empresa.'
      });
    }
  }

  /**
   * PUT /api/v1/catalogo/empresas/:id
   * Actualiza datos de contacto y sede de la empresa (Autogestión de Proveedor)
   */
  static async actualizarEmpresa(req, res) {
    try {
      const { id } = req.params;
      const { telefono, direccion, ciudad, sitio_web, descripcion } = req.body;

      const empresa = await EmpresaModel.getById(id);
      if (!empresa) {
        return res.status(404).json({
          status: 'error',
          codigo: 404,
          mensaje: `No se encontró la empresa con ID ${id}.`
        });
      }

      const actualizada = await EmpresaModel.updateDatos(id, {
        telefono: telefono ? telefono.trim() : empresa.telefono,
        direccion: direccion ? direccion.trim() : empresa.direccion,
        ciudad: ciudad ? ciudad.trim() : empresa.ciudad,
        sitio_web: sitio_web !== undefined ? (sitio_web ? sitio_web.trim() : null) : empresa.sitio_web,
        descripcion: descripcion !== undefined ? (descripcion ? descripcion.trim() : null) : empresa.descripcion
      });

      return res.status(200).json({
        status: 'success',
        codigo: 200,
        mensaje: 'Datos comerciales de la empresa actualizados exitosamente.',
        datos: actualizada
      });
    } catch (error) {
      console.error('[EmpresasController.actualizarEmpresa] Error:', error);
      return res.status(500).json({
        status: 'error',
        codigo: 500,
        mensaje: 'Error interno al actualizar la empresa.'
      });
    }
  }
}

module.exports = EmpresasController;
