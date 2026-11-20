                                                                                
                          
                                                          
                                                                                

const EmpresaModel = require('../models/empresaModel');
const ServicioModel = require('../models/servicioModel');

class EmpresasController {
     
                                   
                                                        
                                                                     
     
  static async registrarEmpresa(req, res) {
    try {
      const {
        razon_social,
        ruc,
        email_contacto,
        telefono,
        sitio_web,
        direccion,
        ciudad,
        descripcion,
        servicios_iniciales                                                         
      } = req.body;

                                                       
      if (!razon_social || !ruc || !email_contacto || !telefono) {
        return res.status(400).json({
          status: 'error',
          codigo: 400,
          mensaje: 'Faltan campos obligatorios. Se requiere: razon_social, ruc, email_contacto y telefono.'
        });
      }

                                                                                                 
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

                                   
      if (!email_contacto.includes('@') || !email_contacto.includes('.')) {
        return res.status(400).json({
          status: 'error',
          codigo: 400,
          mensaje: 'El correo electrónico de contacto no tiene un formato válido.'
        });
      }

                                                                
      const empresaExistente = await EmpresaModel.getByRuc(ruc.trim());
      if (empresaExistente) {
        return res.status(400).json({
          status: 'error',
          codigo: 400,
          mensaje: `Ya existe una solicitud o empresa registrada con el RUC ${ruc.trim()}.`
        });
      }

                                             
      const nuevaEmpresa = await EmpresaModel.create({
        razon_social: razon_social.trim(),
        ruc: ruc.trim(),
        email_contacto: email_contacto.trim(),
        telefono: telefono.trim(),
        sitio_web: sitio_web ? sitio_web.trim() : null,
        direccion: direccion ? direccion.trim() : null,
        ciudad: ciudad ? ciudad.trim() : 'Lima',
        descripcion: descripcion ? descripcion.trim() : null
      });

                                                                                                 
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
      console.error('[EmpresasController.registrarEmpresa] Error:', error);
      return res.status(500).json({
        status: 'error',
        codigo: 500,
        mensaje: 'Error interno en el servidor al registrar la empresa.'
      });
    }
  }

     
                                  
                                                          
                                       
                                                           
                                                                  
     
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

      const servicios = await ServicioModel.getByEmpresaId(empresa.id, true);

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
