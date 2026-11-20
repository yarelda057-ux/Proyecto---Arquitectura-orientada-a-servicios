import { wholesaleRequest, delegationToken } from '../services/wholesaleClient.js';
import { Router } from 'express';
import validateAuth, { requireAdmin } from '../Middleware/authMiddleware.js';
import { queryAudit } from '../services/auditClient.js';
import User from '../models/user.js';
import mongoose from 'mongoose';
import AuditOutbox from '../models/auditOutbox.js';
const router = Router();
router.use(validateAuth, requireAdmin);
router.get('/events', async (req, res) => {
  try {
    const page = await queryAudit(req.query);
    const ids = [...new Set(page.items.map(event => event.actor_id).filter(id => typeof id === 'string' && mongoose.isObjectIdOrHexString(id)))];
    const users = ids.length ? await User.find({ _id: { $in: ids } }).select('_id email role').lean() : [];
    const missingIds = ids.filter(id => !users.some(user => String(user._id) === id));
    if (missingIds.length) {
      try {
        const response = await wholesaleRequest('/api/v1/auth/users?ids=' + encodeURIComponent(missingIds.join(',')), { token: delegationToken(req.user) });
        if (response.ok) users.push(...(await response.json()).users);
      } catch {                                                  }
    }
    const identities = new Map(users.map(user => [String(user._id), user]));
    res.json({ ...page, items: page.items.map(event => ({ ...event, actor_email: identities.get(event.actor_id)?.email || null, actor_role: identities.get(event.actor_id)?.role || null })) });
  }
  catch (error) { res.status(error.status === 400 ? 400 : 503).json({ message: error.status === 400 ? 'Filtros de auditoría inválidos.' : 'El servicio de auditoría no está disponible. Inténtalo nuevamente.' }); }
});
router.get('/delivery', async (req, res) => {
  const [pending, failed] = await Promise.all([AuditOutbox.countDocuments({ state: 'pending' }), AuditOutbox.countDocuments({ state: 'failed' })]);
  res.json({ enabled: process.env.AUDIT_ENABLED === 'true', pending, failed });
});
export default router;
