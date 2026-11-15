import { Router } from 'express';
export function stockRouter({ fetchImpl = fetch } = {}) {
  const router = Router();
  router.use(async (req, res) => {
    if (!/^\/(upload|lotes|products|proveedores|categories|historial|notificaciones)(\/[A-Za-z0-9._-]+)*$/.test(req.path) || req.path.split('/').some(p => p === '.' || p === '..')) return res.status(404).json({ message: 'Operacion de stock inexistente.' });
    if (!['GET', 'POST', 'PUT', 'PATCH'].includes(req.method)) return res.status(405).json({ message: 'Metodo no admitido.' });
    try {
      const base = new URL(process.env.WHOLESALE_SERVICE_URL || 'http://127.0.0.1:3001');
      if (base.username || base.password || (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname) && process.env.NODE_ENV !== 'production'))) throw new Error('URL invalida.');
      const response = await fetchImpl(new URL('/api/v1/stock' + req.url, base), {
        method: req.method, redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { Authorization: req.get('Authorization') || '', 'Idempotency-Key': req.get('Idempotency-Key') || '', 'X-Correlation-ID': req.correlationId, 'Content-Type': 'application/json' },
        ...(req.method !== 'GET' ? { body: JSON.stringify(req.body) } : {}),
      });
      res.set('Cache-Control', 'no-store').status(response.status).json(await response.json());
    } catch (err) { res.status(err.name === 'TimeoutError' ? 504 : 503).json({ message: 'No se pudo obtener el resultado de stock. Consulta el estado del lote antes de repetir una confirmacion.', correlationId: req.correlationId }); }
  });
  return router;
}
