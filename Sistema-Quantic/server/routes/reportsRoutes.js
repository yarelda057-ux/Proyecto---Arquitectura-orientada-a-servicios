import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import validateAuth from '../Middleware/authMiddleware.js';
import { delegationToken } from '../services/wholesaleClient.js';



export function createReportsRouter({ authenticate = validateAuth, fetchImpl = fetch, audit = async () => {} } = {}) {
  const router = Router();
  router.use(authenticate);
  router.use((req, res, next) => req.user?.role === 'admin' ? next() : res.status(403).json({ message: 'Se requieren permisos de administrador para reportes.' }));
  router.use(async (req, res) => {
    if (!/^\/(indicadores|estadisticas|reportes(?:\/[A-Za-z0-9_-]{1,100})?|dashboards(?:\/[A-Za-z0-9_-]{1,100})?)$/.test(req.path) || !['GET', 'POST', 'PUT'].includes(req.method)) return res.status(404).json({ message: 'Operación no encontrada.' });
    const correlationId = res.get('X-Request-ID') || randomUUID();
    try {
      const secret = process.env.REPORTS_INTEGRATION_KEY || '';
      const esbKey = process.env.INTEGRATION_ESB_KEY || '';
      if (secret.length < 32 || esbKey.length < 32) throw new Error('Missing configuration');
      const base = new URL(process.env.INTEGRATION_ESB_URL || 'http://127.0.0.1:8003');
      if (base.username || base.password || (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname) && process.env.NODE_ENV !== 'production'))) throw new Error('Invalid URL');
      const stockAuthorization = 'Bearer ' + delegationToken(req.user);
      const token = jwt.sign({ scopes: ['reports:read', 'reports:write'] }, secret, { algorithm: 'HS256', subject: String(req.user._id), issuer: 'inventory-gateway', audience: 'reports-api', expiresIn: 60 });
      let body = req.body;
      if ((req.method === 'POST' && req.path === '/reportes' && (!body?.periodo || body.periodo.tipo === 'actual')) || (req.method === 'PUT' && req.path.startsWith('/dashboards/'))) {
        if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ message: 'Cuerpo inválido.' });
                                                                                     
        const source = await fetchImpl(new URL('/v1/inventory-source', base), { redirect: 'error', signal: AbortSignal.timeout(30000), headers: { 'X-ESB-Key': esbKey, Authorization: stockAuthorization, 'X-Correlation-ID': correlationId } });
        const snapshot = await source.json();
        if (!source.ok) return res.status(source.status).json(snapshot);
        if (typeof snapshot.versionInventario !== 'string') throw new Error('Invalid source');
        if (body.versionInventario && body.versionInventario !== snapshot.versionInventario) return res.status(409).json({ message: 'El inventario cambió. Actualiza el dashboard antes de generar el reporte.' });
        body = { ...body, versionInventario: snapshot.versionInventario };
      }
      const response = await fetchImpl(new URL('/v1/reports' + req.url, base), { method: req.method, redirect: 'error', signal: AbortSignal.timeout(30000), headers: { 'X-ESB-Key': esbKey, Authorization: 'Bearer ' + token, 'X-Stock-Authorization': stockAuthorization, 'X-Correlation-ID': correlationId, 'Content-Type': 'application/json' }, ...(['POST', 'PUT'].includes(req.method) ? { body: JSON.stringify(body) } : {}) });
      const data = await response.json();
      res.set('Cache-Control', 'no-store').set('X-Correlation-ID', correlationId).status(response.status).json(data);
    } catch (err) { res.status(err.name === 'TimeoutError' ? 504 : 503).json({ message: 'No se pudo completar el reporte y su registro de auditoría.', correlationId }); }
  });
  return router;
}
export default createReportsRouter();
