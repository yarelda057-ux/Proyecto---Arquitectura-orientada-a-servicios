import { Router } from 'express';

const allowed = { servicios: ['q', 'categoria', 'ciudad', 'tipo_servicio'], empresas: ['q', 'ciudad'] };
const fail = (status, message) => Object.assign(new Error(message), { status });
export function additionalServicesRouter() {
  const router = Router();
  router.get(['/:resource', '/:resource/:id'], async (req, res) => {
    const { resource, id } = req.params;
    try {
      if (!allowed[resource] || (id !== undefined && !/^[1-9]\d{0,9}$/.test(id))) throw fail(404, 'Consulta no encontrada.');
      const url = new URL(process.env.ADDITIONAL_SERVICES_URL || 'http://127.0.0.1:3002');
      if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) && process.env.NODE_ENV !== 'production'))) throw fail(503, 'El servicio de servicios adicionales no está disponible.');
      url.pathname = '/api/v1/catalogo/' + resource + (id ? '/' + id : '');
      url.search = ''; url.hash = '';
      for (const [name, value] of Object.entries(req.query)) {
        if (id || !allowed[resource].includes(name) || typeof value !== 'string' || value.length > 160) throw fail(400, 'Filtros de consulta inválidos.');
        if (value.trim()) url.searchParams.set(name, value.trim());
      }
      const timeout = Number(process.env.ADDITIONAL_SERVICES_TIMEOUT_MS || 5000);
      if (!Number.isInteger(timeout) || timeout < 500 || timeout > 30000) throw fail(503, 'Configuración del servicio no disponible.');
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(timeout), headers: { Accept: 'application/json', 'X-Correlation-ID': req.correlationId } });
      if (response.status === 404) throw fail(404, 'El registro no está disponible en el catálogo.');
      if (!response.ok) throw fail(503, 'El servicio de servicios adicionales no está disponible. Inténtalo nuevamente.');
      const result = await response.json();
      if (result.status !== 'success' || (!id && !Array.isArray(result.datos)) || (id && (!result.datos || typeof result.datos !== 'object' || Array.isArray(result.datos)))) throw fail(502, 'El servicio devolvió una respuesta inesperada.');
                                                                                                 
      if (id && resource === 'servicios' && (result.datos.estado !== 'APROBADO' || result.datos.empresa?.estado_verificacion !== 'APROBADO')) throw fail(404, 'El registro no está disponible en el catálogo.');
      if (id && resource === 'empresas' && result.datos.estado_verificacion !== 'APROBADO') throw fail(404, 'El registro no está disponible en el catálogo.');
      res.set('Cache-Control', 'no-store').json({ ...result, correlationId: req.correlationId });
    } catch (error) {
      const status = error.name === 'TimeoutError' ? 504 : error.status || 503;
      res.status(status).json({ message: error.status ? error.message : 'El servicio de servicios adicionales no está disponible. Inténtalo nuevamente.', correlationId: req.correlationId });
    }
  });
  router.use((_req, res) => res.status(404).json({ message: 'Consulta no encontrada.' }));
  return router;
}
