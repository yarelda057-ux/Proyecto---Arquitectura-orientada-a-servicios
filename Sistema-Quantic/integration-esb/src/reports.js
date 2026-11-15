import { Router } from 'express';

export function reportsRouter({ fetchImpl = fetch } = {}) {
  const router = Router();
  router.use(async (req, res) => {
    const source = req.path.replace(/\/$/, '') === '/inventory-source' && req.method === 'GET';
    const events = req.path.replace(/\/$/, '') === '/inventory-events' && req.method === 'GET';
    const reporting = /^\/reports\/(actualizaciones|indicadores|estadisticas|reportes(?:\/[A-Za-z0-9_-]{1,100})?|dashboards(?:\/[A-Za-z0-9_-]{1,100})?)$/.test(req.path);
    if (!source && !events && !reporting) return res.status(404).json({ message: 'Ruta no encontrada.' });
    if (!['GET', 'POST', 'PUT'].includes(req.method)) return res.status(405).json({ message: 'Método no admitido.' });
    try {
      const base = new URL(source || events ? (process.env.WHOLESALE_SERVICE_URL || 'http://127.0.0.1:3001') : (process.env.REPORTS_SERVICE_URL || 'http://127.0.0.1:8004'));
      if (base.username || base.password || (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname) && process.env.NODE_ENV !== 'production'))) throw new Error('Invalid URL');
      const path = events ? '/api/v1/stock/eventos-stock' : source ? '/api/v1/stock/snapshot' : '/api/v1/inventario' + req.path.slice('/reports'.length);
      const suffix = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      const response = await fetchImpl(new URL(path + suffix, base), {
        method: req.method, redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: req.get('Authorization') || '', 'X-Correlation-ID': req.correlationId, ...(!source ? { 'X-Stock-Authorization': req.get('X-Stock-Authorization') || '' } : {}) },
        ...(['POST', 'PUT'].includes(req.method) ? { body: JSON.stringify(req.body) } : {})
      });
      const data = await response.json();
      res.set('Cache-Control', 'no-store').status(response.status).json(data);
    } catch (err) { res.status(err.name === 'TimeoutError' ? 504 : 503).json({ message: 'Servicio de inventario o reportes no disponible.', correlationId: req.correlationId }); }
  });
  return router;
}
