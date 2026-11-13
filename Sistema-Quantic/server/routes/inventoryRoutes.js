import { Router } from 'express';
import mongoose from 'mongoose';
import validateAuth from '../Middleware/authMiddleware.js';
export function validateInventory(body, partial = false) {
  const fail = () => { const error = new Error('Revisa los campos, estados y números de serie.'); error.status = 400; throw error; };
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail();
  const allowed = ['p_n', 'descripcion', 'marca', 'state', 'p_a', 's_n', 'cantidad'];
  if (Object.keys(body).some(key => !allowed.includes(key)) || !Object.keys(body).length) fail();
  const result = {};
  for (const field of allowed.filter(key => !['s_n', 'cantidad'].includes(key))) {
    if (partial && !(field in body)) continue;
    if (typeof body[field] !== 'string' || !body[field].trim() || body[field].length > (field === 'descripcion' ? 1000 : 160)) fail();
    result[field] = body[field].trim();
  }
  if (result.state && !['New', 'Refurbished'].includes(result.state)) fail();
  if (result.p_a && !['Producción', 'Almacén'].includes(result.p_a)) fail();
  if (!partial || 's_n' in body) {
    if (!Array.isArray(body.s_n) || body.s_n.length > 1000 || body.s_n.some(value => typeof value !== 'string' || !value.trim() || value.length > 160)) fail();
    result.s_n = body.s_n.map(value => value.trim());
    if (new Set(result.s_n).size !== result.s_n.length) fail();
    result.cantidad = result.s_n.length;
  }
  if ('cantidad' in body && (!Number.isInteger(body.cantidad) || body.cantidad !== result.cantidad)) fail();
  return result;
}
export function requireInternalInventory(req, res, next) {
  if (!['admin', 'user'].includes(req.user.role)) return res.status(403).json({ message: 'No tienes acceso al inventario interno.' });
  next();
}
export default function inventoryRoutes(Model, names) {
  const router = Router();
  router.get('/' + names.all, validateAuth, requireInternalInventory, async (req, res) => res.json(await Model.find().sort({ p_n: 1 }).lean()));
  router.post('/' + names.add, validateAuth, requireInternalInventory, async (req, res) => {
    const data = validateInventory(req.body);
    if (await Model.exists({ p_n: data.p_n, marca: data.marca, state: data.state })) return res.status(409).json({ message: 'Ya existe un producto con ese número de parte, marca y estado.' });
    res.status(201).json({ data: await Model.create(data) });
  });
  for (const [method, route] of [['patch', names.edit], ['delete', names.remove]]) {
    router[method]('/' + route + '/:id', validateAuth, requireInternalInventory, async (req, res) => {
      if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(400).json({ message: 'Identificador inválido.' });
      const data = method === 'patch'
        ? await Model.findByIdAndUpdate(req.params.id, { $set: validateInventory(req.body, true) }, { new: true, runValidators: true })
        : await Model.findByIdAndDelete(req.params.id);
      if (!data) return res.status(404).json({ message: 'Producto no encontrado.' });
      res.json({ data });
    });
  }
  return router;
}
