import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import validateAuth from '../Middleware/authMiddleware.js';
import { delegationToken } from '../services/wholesaleClient.js';
import { enqueueAudit } from '../services/auditDelivery.js';
import AnalyticsJob from '../models/analyticsJob.js';

export function createReportsRouter({ authenticate = validateAuth, fetchImpl = fetch, audit = enqueueAudit } = {}) {
  const router = Router();
  router.use(authenticate);
  router.use((req, res, next) => req.user?.role === 'admin' ? next() : res.status(403).json({ message: 'Se requieren permisos de administrador para reportes.' }));
  router.get('/procesos', async (_req, res, next) => {
    try {
      const jobs = await AnalyticsJob.find({}).sort({ sequence: -1 }).limit(20).lean();
      const pendientes = await AnalyticsJob.countDocuments({ state: { $ne: 'complete' } });
      res.set('Cache-Control', 'no-store').json({ pendientes, procesos: jobs.map(j => ({ versionInventario: j._id, idLote: j.batchId, estado: j.state === 'complete' ? 'COMPLETO' : 'STOCK_CONFIRMADO_CON_PENDIENTES', dashboard: j.dashboardDone ? 'ACTUALIZADO' : 'PENDIENTE', auditoria: j.auditDone ? 'REGISTRADA' : 'PENDIENTE', requiereReintento: j.state === 'failed', intentos: j.attempts, actualizadoEn: j.updatedAt })) });
    } catch (err) { next(err); }
  });
  router.post('/procesos/:version/reintentar', async (req, res, next) => {
    try {
      if (!/^INV-\d{6,}$/.test(req.params.version)) return res.status(400).json({ message: 'Version invalida.' });
      const result = await AnalyticsJob.updateOne({ _id: req.params.version, state: 'failed' }, { $set: { state: 'pending', attempts: 0, nextAttemptAt: new Date(), lockedUntil: new Date(0), lastError: '' } });
      res.status(result.modifiedCount ? 202 : 409).json({ message: result.modifiedCount ? 'Se reintentaran solo las etapas pendientes.' : 'El proceso no necesita un reintento manual.' });
    } catch (err) { next(err); }
  });
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
        // El coordinador obtiene una versión confirmada antes de componer S2 con S4.
        const source = await fetchImpl(new URL('/v1/inventory-source', base), { redirect: 'error', signal: AbortSignal.timeout(30000), headers: { 'X-ESB-Key': esbKey, Authorization: stockAuthorization, 'X-Correlation-ID': correlationId } });
        const snapshot = await source.json();
        if (!source.ok) return res.status(source.status).json(snapshot);
        if (typeof snapshot.versionInventario !== 'string') throw new Error('Invalid source');
        if (body.versionInventario && body.versionInventario !== snapshot.versionInventario) return res.status(409).json({ message: 'El inventario cambió. Actualiza el dashboard antes de generar el reporte.' });
        body = { ...body, versionInventario: snapshot.versionInventario };
      }
      const response = await fetchImpl(new URL('/v1/reports' + req.url, base), { method: req.method, redirect: 'error', signal: AbortSignal.timeout(30000), headers: { 'X-ESB-Key': esbKey, Authorization: 'Bearer ' + token, 'X-Stock-Authorization': stockAuthorization, 'X-Correlation-ID': correlationId, 'Content-Type': 'application/json' }, ...(['POST', 'PUT'].includes(req.method) ? { body: JSON.stringify(body) } : {}) });
      const data = await response.json();
      if (response.ok) {
        if (process.env.AUDIT_ENABLED !== 'true') throw new Error('Audit disabled');
        const selectedFilters = body?.filtros || data.filtros || Object.fromEntries(Object.entries(req.query).filter(([key]) => ['categoria', 'idMayorista'].includes(key)));
        const selectedIndicators = body?.indicadores || data.configuracion?.indicadores;
        await audit({ event_id: randomUUID(), request_id: correlationId, actor_id: String(req.user._id), occurred_at: new Date().toISOString(), method: req.method, path: '/api/v1/inventario' + req.path, status_code: response.status, duration_ms: 0, context: { operation: 'INVENTORY_ANALYTICS', ...(data.versionInventario ? { inventory_version: data.versionInventario } : {}), filters: Object.fromEntries(Object.entries(selectedFilters).filter(([key]) => ['categoria', 'idMayorista'].includes(key))), ...((body?.tipo || data.tipo) === 'stockActual' ? { report_type: 'stockActual' } : {}), ...(data.idDashboard ? { dashboard_id: data.idDashboard } : {}), ...(Array.isArray(selectedIndicators) ? { indicators: selectedIndicators } : {}) } });
        req.auditRecorded = true;
        data.auditoria = 'PENDIENTE_ENTREGA';
      }
      res.set('Cache-Control', 'no-store').set('X-Correlation-ID', correlationId).status(response.status).json(data);
    } catch (err) { res.status(err.name === 'TimeoutError' ? 504 : 503).json({ message: 'No se pudo completar el reporte y su registro de auditoría.', correlationId }); }
  });
  return router;
}
export default createReportsRouter();
