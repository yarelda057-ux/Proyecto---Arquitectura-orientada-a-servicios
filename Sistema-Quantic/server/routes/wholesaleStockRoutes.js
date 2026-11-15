import { Router } from 'express';
import validateAuth from '../Middleware/authMiddleware.js';
import { delegationToken, wholesaleCookie, wholesaleRequest } from '../services/wholesaleClient.js';
const router = Router();
router.use(validateAuth);
router.use(async (req, res) => {
  const token = req.user.role === 'mayorista' ? req.cookies[wholesaleCookie()] : delegationToken(req.user);
  // Construimos la URL con prefijo fijo y solo reenviamos el contrato de stock.
  const response = await wholesaleRequest('/api/v1/stock' + req.url, {
    method: req.method, token, viaEsb: true, correlationId: res.get('X-Request-ID'),
    ...(!['GET', 'HEAD'].includes(req.method) ? { body: req.body } : {}),
    idempotencyKey: req.get('Idempotency-Key')
  });
  res.status(response.status).json(await response.json());
});
export default router;
