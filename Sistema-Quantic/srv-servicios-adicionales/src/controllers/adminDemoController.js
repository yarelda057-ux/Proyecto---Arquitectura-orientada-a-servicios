// =============================================================================
// CONTROLADOR DE ADMINISTRACIÓN Y CONTROL DE CATÁLOGO
// Quantic Technology S.A.C.
// AVISO IMPORTANTE:
// Este controlador permite la revisión, aprobación, rechazo e inhabilitación
// de empresas y servicios para el control operativo del catálogo comercial.
// =============================================================================

const EmpresaModel = require('../models/empresaModel');
const ServicioModel = require('../models/servicioModel');

class AdminDemoController {
  /**
   * GET /api/v1/demo-admin/solicitudes
   * Retorna el listado completo de solicitudes y empresas con sus servicios asociados,
   * permitiendo filtrar por estado ('PENDIENTE', 'APROBADO', 'INACTIVO', 'RECHAZADO').
   */
  static async listarSolicitudes(req, res) {
    try {
      const { estado } = req.query;
      const empresas = await EmpresaModel.getTodasLasSolicitudes({ estado });

      // Cargar los servicios vinculados a cada empresa para visualización completa
      const solicitudesCompletas = await Promise.all(
        empresas.map(async (empresa) => {
          const servicios = await ServicioModel.getByEmpresaId(empresa.id, false);
          return {
            ...empresa,
            servicios
          };
        })
      );

      return res.status(200).json({
        status: 'success',
        codigo: 200,
        aviso: 'Consola de gestión y control operativo de proveedores y servicios',
        total: solicitudesCompletas.length,
        datos: solicitudesCompletas
      });
    } catch (error) {
      console.error('[AdminDemoController.listarSolicitudes] Error:', error);
      return res.status(500).json({
        status: 'error',
        codigo: 500,
        mensaje: 'Error interno al consultar las solicitudes para administración.'
      });
    }
  }

  /**
   * PATCH /api/v1/demo-admin/empresas/:id/estado
   * Aprueba, rechaza o inhabilita una empresa proveedora.
   * Body: { estado: 'APROBADO' | 'RECHAZADO' | 'PENDIENTE' | 'INACTIVO', notas: '...', aprobar_servicios: true }
   */
  static async actualizarEstadoEmpresa(req, res) {
    try {
      const { id } = req.params;
      const { estado, notas, aprobar_servicios } = req.body;

      const estadosValidos = ['APROBADO', 'RECHAZADO', 'PENDIENTE', 'INACTIVO'];
      if (!estado || !estadosValidos.includes(estado)) {
        return res.status(400).json({
          status: 'error',
          codigo: 400,
          mensaje: "El estado proporcionado es inválido. Debe ser 'APROBADO', 'RECHAZADO', 'PENDIENTE' o 'INACTIVO'."
        });
      }

      const empresa = await EmpresaModel.getById(id);
      if (!empresa) {
        return res.status(404).json({
          status: 'error',
          codigo: 404,
          mensaje: `No se encontró la empresa con ID ${id}.`
        });
      }

      // Actualizar estado de la empresa
      const empresaActualizada = await EmpresaModel.updateEstado(
        id,
        estado,
        notas || `Actualización en consola administrativa (${new Date().toLocaleDateString('es-PE')})`
      );

      // Si la empresa se inhabilita, inhabilitar en cascada sus servicios asociados
      if (estado === 'INACTIVO') {
        await ServicioModel.updateEstadoPorEmpresa(id, 'INACTIVO');
      } else if (estado === 'APROBADO' && aprobar_servicios !== false) {
        await ServicioModel.updateEstadoPorEmpresa(id, 'APROBADO');
      } else if (estado === 'RECHAZADO') {
        await ServicioModel.updateEstadoPorEmpresa(id, 'RECHAZADO');
      }

      let mensajeAccion = `Empresa "${empresa.razon_social}" actualizada al estado: ${estado}.`;
      if (estado === 'INACTIVO') {
        mensajeAccion = `Empresa "${empresa.razon_social}" inhabilitada. Ni la empresa ni sus servicios aparecerán en el catálogo público.`;
      } else if (estado === 'APROBADO') {
        mensajeAccion = `Empresa "${empresa.razon_social}" habilitada exitosamente para el catálogo público.`;
      }

      return res.status(200).json({
        status: 'success',
        codigo: 200,
        mensaje: mensajeAccion,
        datos: empresaActualizada
      });
    } catch (error) {
      console.error('[AdminDemoController.actualizarEstadoEmpresa] Error:', error);
      return res.status(500).json({
        status: 'error',
        codigo: 500,
        mensaje: 'Error interno al actualizar el estado de la empresa.'
      });
    }
  }

  /**
   * PATCH /api/v1/demo-admin/servicios/:id/estado
   * Aprueba, rechaza o inhabilita individualmente un servicio.
   * Body: { estado: 'APROBADO' | 'RECHAZADO' | 'PENDIENTE' | 'INACTIVO' }
   */
  static async actualizarEstadoServicio(req, res) {
    try {
      const { id } = req.params;
      const { estado } = req.body;

      const estadosValidos = ['APROBADO', 'RECHAZADO', 'PENDIENTE', 'INACTIVO'];
      if (!estado || !estadosValidos.includes(estado)) {
        return res.status(400).json({
          status: 'error',
          codigo: 400,
          mensaje: "El estado proporcionado es inválido. Debe ser 'APROBADO', 'RECHAZADO', 'PENDIENTE' o 'INACTIVO'."
        });
      }

      const servicio = await ServicioModel.getById(id);
      if (!servicio) {
        return res.status(404).json({
          status: 'error',
          codigo: 404,
          mensaje: `No se encontró el servicio con ID ${id}.`
        });
      }

      const servicioActualizado = await ServicioModel.updateEstado(id, estado);

      let mensajeAccion = `Servicio "${servicio.nombre}" actualizado al estado: ${estado}.`;
      if (estado === 'INACTIVO') {
        mensajeAccion = `Servicio "${servicio.nombre}" inhabilitado. Ya no se mostrará en el catálogo público.`;
      } else if (estado === 'APROBADO') {
        mensajeAccion = `Servicio "${servicio.nombre}" habilitado y publicado en el catálogo.`;
      }

      return res.status(200).json({
        status: 'success',
        codigo: 200,
        mensaje: mensajeAccion,
        datos: servicioActualizado
      });
    } catch (error) {
      console.error('[AdminDemoController.actualizarEstadoServicio] Error:', error);
      return res.status(500).json({
        status: 'error',
        codigo: 500,
        mensaje: 'Error interno al actualizar el estado del servicio.'
      });
    }
  }
}

module.exports = AdminDemoController;

