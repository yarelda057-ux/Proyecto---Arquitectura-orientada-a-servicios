// =============================================================================
// CONTROLADOR DE SERVICIOS
// Microservicio: SRV-G5202605 - Quantic Technology S.A.C.
// =============================================================================

const ServicioModel = require('../models/servicioModel');
const EmpresaModel = require('../models/empresaModel');

class ServiciosController {
  /**
   * POST /api/v1/catalogo/servicios
   * Registra un nuevo servicio asociado a una empresa existente.
   * Flujo de negocio: Se guarda inicialmente con estado 'PENDIENTE' de aprobación.
   */
  static async registrarServicio(req, res) {
    try {
      const {
        empresa_id,
        nombre,
        descripcion,
        categoria,
        tipo_servicio,
        precio_referencial
      } = req.body;

      // 1. Validaciones de campos obligatorios
      if (!empresa_id || !nombre || !categoria) {
        return res.status(400).json({
          status: 'error',
          codigo: 400,
          mensaje: 'Faltan campos obligatorios. Se requiere: empresa_id, nombre y categoria.'
        });
      }

      // 2. Verificar que la empresa exista
      const empresa = await EmpresaModel.getById(empresa_id);
      if (!empresa) {
        return res.status(404).json({
          status: 'error',
          codigo: 404,
          mensaje: `No se encontró la empresa con ID ${empresa_id}. Debe registrar la empresa primero.`
        });
      }

      // 3. Crear el servicio con estado PENDIENTE
      const nuevoServicio = await ServicioModel.create({
        empresa_id,
        nombre: nombre.trim(),
        descripcion: descripcion ? descripcion.trim() : 'Sin descripción detallada',
        categoria: categoria.trim(),
        tipo_servicio: tipo_servicio ? tipo_servicio.trim() : 'Presencial / Remoto',
        precio_referencial: precio_referencial ? precio_referencial.trim() : 'A cotizar'
      });

      return res.status(201).json({
        status: 'success',
        codigo: 201,
        mensaje: 'Servicio registrado exitosamente. Se encuentra en estado PENDIENTE de verificación administrativa.',
        datos: nuevoServicio
      });
    } catch (error) {
      console.error('[ServiciosController.registrarServicio] Error:', error);
      return res.status(500).json({
        status: 'error',
        codigo: 500,
        mensaje: 'Error interno en el servidor al registrar el servicio.'
      });
    }
  }

  /**
   * GET /api/v1/catalogo/servicios
   * Consulta pública de servicios autorizados en el catálogo.
   * Parámetros de consulta compatibles con la ficha técnica y ampliaciones documentadas:
   *  - categoria: Filtra por categoría exacta (ej: 'Soporte técnico', 'Ciberseguridad')
   *  - q: Búsqueda por palabra clave en título del servicio, descripción o nombre de la empresa
   *  - ciudad: Filtra por ciudad de la empresa proveedora (ej: 'Lima', 'Arequipa')
   *  - tipo_servicio: Filtra por modalidad (ej: 'Presencial', 'Remoto', 'Híbrido')
   */
  static async obtenerServicios(req, res) {
    try {
      const { categoria, q, ciudad, tipo_servicio } = req.query;

      const servicios = await ServicioModel.getPublicos(
        { categoria, q, ciudad, tipo_servicio },
        EmpresaModel
      );

      return res.status(200).json({
        status: 'success',
        codigo: 200,
        total: servicios.length,
        filtros_aplicados: {
          categoria: categoria || null,
          q: q || null,
          ciudad: ciudad || null,
          tipo_servicio: tipo_servicio || null
        },
        datos: servicios
      });
    } catch (error) {
      console.error('[ServiciosController.obtenerServicios] Error:', error);
      return res.status(500).json({
        status: 'error',
        codigo: 500,
        mensaje: 'Error interno al consultar los servicios del catálogo.'
      });
    }
  }

  /**
   * GET /api/v1/catalogo/servicios/:id
   * Obtiene la ficha de un servicio específico publicado.
   */
  static async obtenerServicioPorId(req, res) {
    try {
      const { id } = req.params;
      const servicio = await ServicioModel.getById(id);

      if (!servicio || servicio.estado !== 'APROBADO') {
        return res.status(404).json({
          status: 'error',
          codigo: 404,
          mensaje: 'Servicio no encontrado o no autorizado para publicación pública.'
        });
      }

      const empresa = await EmpresaModel.getById(servicio.empresa_id);

      return res.status(200).json({
        status: 'success',
        codigo: 200,
        datos: {
          ...servicio,
          empresa: empresa || null
        }
      });
    } catch (error) {
      console.error('[ServiciosController.obtenerServicioPorId] Error:', error);
      return res.status(500).json({
        status: 'error',
        codigo: 500,
        mensaje: 'Error interno al consultar el servicio.'
      });
    }
  }

  /**
   * PUT /api/v1/catalogo/servicios/:id
   * Actualiza los datos de un servicio tecnológico (nombre, categoría, modalidad, precio, descripción)
   */
  static async actualizarServicio(req, res) {
    try {
      const { id } = req.params;
      const { nombre, categoria, tipo_servicio, precio_referencial, descripcion } = req.body;

      const servicio = await ServicioModel.getById(id);
      if (!servicio) {
        return res.status(404).json({
          status: 'error',
          codigo: 404,
          mensaje: `No se encontró el servicio con ID ${id}.`
        });
      }

      const actualizado = await ServicioModel.updateDatos(id, {
        nombre: nombre ? nombre.trim() : servicio.nombre,
        categoria: categoria ? categoria.trim() : servicio.categoria,
        tipo_servicio: tipo_servicio ? tipo_servicio.trim() : servicio.tipo_servicio,
        precio_referencial: precio_referencial ? precio_referencial.trim() : servicio.precio_referencial,
        descripcion: descripcion ? descripcion.trim() : servicio.descripcion
      });

      return res.status(200).json({
        status: 'success',
        codigo: 200,
        mensaje: `Servicio "${actualizado.nombre}" actualizado exitosamente.`,
        datos: actualizado
      });
    } catch (error) {
      console.error('[ServiciosController.actualizarServicio] Error:', error);
      return res.status(500).json({
        status: 'error',
        codigo: 500,
        mensaje: 'Error interno al actualizar el servicio.'
      });
    }
  }
}

module.exports = ServiciosController;
