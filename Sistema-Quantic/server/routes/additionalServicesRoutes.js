import { Router } from 'express';
import validateAuth from '../Middleware/authMiddleware.js';
import { additionalServicesRequest } from '../services/additionalServicesClient.js';

export function createAdditionalServicesRouter({ authenticate = validateAuth } = {}) {
  const router = Router();
  router.use(authenticate);
  router.use((req, res, next) => {
    if (!['admin', 'user', 'mayorista'].includes(req.user?.role)) return res.status(403).json({ message: 'Tu cuenta no tiene permiso para consultar este módulo.' });
    next();
  });
  router.get(['/:resource', '/:resource/:id'], async (req, res) => {
    const { resource, id } = req.params;
    const fields = resource === 'servicios' ? ['q', 'categoria', 'ciudad', 'tipo_servicio'] : resource === 'empresas' ? ['q', 'ciudad'] : null;
    if (!fields || (id !== undefined && !/^[1-9]\d{0,9}$/.test(id))) return res.status(404).json({ message: 'Consulta no encontrada.' });
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(req.query)) {
      if (id || !fields.includes(name) || typeof value !== 'string' || value.length > 160) return res.status(400).json({ message: 'Filtros de consulta inválidos.' });
      if (value.trim()) query.set(name, value.trim());
    }
    try {
      const path = resource + (id ? '/' + id : '') + (query.size ? '?' + query : '');
      res.set('Cache-Control', 'no-store').json(await additionalServicesRequest(path, res.get('X-Request-ID')));
    } catch (error) { res.status(error.status || 503).json({ message: error.message }); }
  });
  router.use((_req, res) => res.status(404).json({ message: 'Consulta no encontrada.' }));
  return router;
}
export default createAdditionalServicesRouter();
