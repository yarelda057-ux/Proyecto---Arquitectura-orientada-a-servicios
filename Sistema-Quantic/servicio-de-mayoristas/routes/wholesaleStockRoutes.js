import { presentationWorkbook } from '../presentationWorkbook.js';
import { Router, mongoose, ExcelJS } from '../dependencies.js';

import { createHash, randomUUID } from 'node:crypto';

import validateAuth, { requireAdmin } from '../Middleware/authMiddleware.js';
import Supplier from '../models/supplier.js';
import SupplierStock from '../models/supplierStock.js';
import StockBatch from '../models/stockBatch.js';
import StockVersion from '../models/stockVersion.js';
import User from '../models/user.js';
import Session from '../models/session.js';
import NotificationOutbox from '../models/notificationOutbox.js';
import { enqueueNotification } from '../services/notificationOutboxWorker.js';

const Archive = mongoose.models.StockFile || mongoose.model('StockFile', new mongoose.Schema({
  batchId: { type: String, unique: true, required: true }, data: Buffer
}, { timestamps: true }));
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 10000;
const MAX_PAGE_SIZE = 100;
const SUPPLIER_ID = /^MAY-[A-Z0-9-]{4,58}$/;
const SIMPLE_ID = /^[A-Za-z0-9._:-]{1,100}$/;

const HEADER_ALIASES = {
  partNumber: new Set(['partnumber', 'partno', 'partnum', 'codigo', 'codigoproducto', 'codigodeproducto']),
  descripcion: new Set(['descripcion', 'description', 'detalle']),
  cantidad: new Set(['qty', 'cantidad', 'quantity', 'stock']),
  precioUsd: new Set(['precious', 'preciousd', 'preciodolares', 'preciodolar', 'priceusd', 'price']),
  categoria: new Set(['categoria', 'category']),
};

function error(status, message) {
  const result = new Error(message);
  result.status = status;
  return result;
}

function text(value, maxLength) {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  return result && result.length <= maxLength ? result : null;
}

function normalizeSupplierId(value) {
  const result = text(value, 64)?.toUpperCase();
  if (!result || !SUPPLIER_ID.test(result)) throw error(400, 'Identificador de mayorista inválido.');
  return result;
}

function assertObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw error(400, 'Datos inválidos.');
}

function assertOnly(value, allowed) {
  assertObject(value);
  if (Object.keys(value).some(key => !allowed.includes(key))) throw error(400, 'Datos inválidos.');
}

function isEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function publicSupplier(supplier) {
  return {
    idMayorista: supplier.supplierId,
    nombre: supplier.nombre,
    ruc: supplier.ruc || null,
    correoContacto: supplier.correoContacto,
    periodoActualizacionDias: supplier.periodoActualizacionDias,
    activo: supplier.activo,
  };
}

function publicProduct(product, supplierNames = new Map()) {
  return {
    idProducto: String(product._id),
    idMayorista: product.supplierId,
    nombreMayorista: supplierNames.get(product.supplierId) || undefined,
    partNumber: product.partNumber,
    descripcion: product.descripcion,
    cantidad: product.cantidad,
    precioUsd: product.precioUsd,
    categoria: product.categoria,
    versionInventario: product.versionInventario,
    actualizadoEn: product.updatedAt,
  };
}

function ensureSupplierAccess(req, supplierId) {
  if (req.user.role === 'mayorista' && req.user.supplierId !== supplierId) throw error(403, 'No tienes permiso para operar sobre este mayorista.');
}

async function getSupplier(supplierId, { activeOnly = false } = {}) {
  const supplier = await Supplier.findOne({ supplierId, ...(activeOnly ? { activo: true } : {}) });
  if (!supplier) throw error(404, 'Mayorista no encontrado.');
  return supplier;
}

function normalizedHeader(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function parsePrice(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  let normalized = value.trim().replace(/[$\s]/g, '');
  if (!normalized) return null;
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(normalized)) normalized = normalized.replace(/,/g, '');
  else if (/^-?\d+(,\d+)?$/.test(normalized)) normalized = normalized.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function valuesOf(row) {
  const values = [];
  row.eachCell({ includeEmpty: true }, (cell, columnNumber) => { values[columnNumber - 1] = cell.value; });
  return values;
}

async function parseWorkbook(buffer) {
  if (buffer.includes(Buffer.from('vbaProject.bin'))) throw error(400, 'La plantilla no admite macros.');
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer, { ignoreNodes: ['dataValidations', 'conditionalFormatting', 'extLst'] });
  } catch {
    throw error(400, 'El archivo XLSX está corrupto o no es compatible.');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet || !sheet.rowCount) throw error(400, 'La hoja no contiene información.');
  let formulaFound = false;
  sheet.eachRow({ includeEmpty: false }, row => row.eachCell({ includeEmpty: false }, cell => {
    if (cell.type === ExcelJS.ValueType.Formula || cell.value?.formula) formulaFound = true;
  }));
  if (formulaFound) throw error(400, 'La plantilla no admite fórmulas.');
  // Localiza la primera cabecera completa aunque haya márgenes o títulos.
  const required = ['partNumber', 'descripcion', 'cantidad', 'precioUsd'];
  let headerRow = 1;
  for (let rowIndex = 1; rowIndex <= Math.min(sheet.rowCount, 100); rowIndex++) {
    const candidates = valuesOf(sheet.getRow(rowIndex)).map(normalizedHeader);
    if (required.every(field => candidates.some(value => HEADER_ALIASES[field].has(value)))) {
      headerRow = rowIndex;
      break;
    }
  }
  const headers = valuesOf(sheet.getRow(headerRow));

  const indices = {};
  for (const [index, value] of headers.entries()) {
    const header = normalizedHeader(value);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.has(header)) {
        if (indices[field] !== undefined) throw error(400, 'La plantilla tiene columnas duplicadas.');
        indices[field] = index;
      }
    }
  }
  const missing = required.filter(field => indices[field] === undefined);
  if (missing.length) {
    return { totalFilas: 0, filasCorrectas: 0, filas: [], errores: [{ fila: 1, campo: 'cabecera', motivo: 'Faltan las columnas obligatorias: PartNumber, Descripción, QTY y Precio US$.' }] };
  }

  const filas = [];
  const errores = [];
  const seenPartNumbers = new Set();
  let totalFilas = 0;
  let filasCorrectas = 0;
  for (let index = headerRow + 1; index <= sheet.rowCount; index++) {
    const excelRow = sheet.getRow(index);
    const first = excelRow.getCell(indices.partNumber + 1);
    if (first.isMerged && required.every(field => excelRow.getCell(indices[field] + 1).master.address === first.master.address)) continue;
    const row = valuesOf(excelRow);
    if (required.every(field => HEADER_ALIASES[field].has(normalizedHeader(row[indices[field]])))) continue;
    if (!row.some(hasValue)) continue;
    const partRaw = row[indices.partNumber];
    const qtyRaw = row[indices.cantidad];
    const priceRaw = row[indices.precioUsd];
    // Las filas de título de categoría (por ejemplo, “Firewalls solo HW”) no son datos.
    if (!hasValue(partRaw) && !hasValue(qtyRaw) && !hasValue(priceRaw)) continue;
    totalFilas++;
    if (totalFilas > MAX_ROWS) throw error(413, `El archivo supera el máximo de ${MAX_ROWS} filas.`);
    const rowNumber = index;
    const partNumber = text(String(partRaw ?? ''), 160);
    const descripcion = text(String(row[indices.descripcion] ?? ''), 1000);
    const cantidad = typeof qtyRaw === 'number' ? qtyRaw : Number(String(qtyRaw ?? '').trim());
    const precioUsd = parsePrice(priceRaw);
    const categoria = indices.categoria === undefined ? 'Sin categoría' : (text(String(row[indices.categoria] ?? ''), 160) || 'Sin categoría');
    let valid = true;
    if (!partNumber) { errores.push({ fila: rowNumber, campo: 'PartNumber', motivo: 'Es obligatorio y debe tener como máximo 160 caracteres.' }); valid = false; }
    else if (seenPartNumbers.has(partNumber.toUpperCase())) { errores.push({ fila: rowNumber, campo: 'PartNumber', motivo: 'El producto está repetido dentro del archivo.' }); valid = false; }
    if (!descripcion) { errores.push({ fila: rowNumber, campo: 'Descripción', motivo: 'Es obligatoria y debe tener como máximo 1000 caracteres.' }); valid = false; }
    if (!hasValue(qtyRaw) || !Number.isSafeInteger(cantidad) || cantidad < 0) { errores.push({ fila: rowNumber, campo: 'QTY', motivo: 'Debe ser un entero no negativo.' }); valid = false; }
    if (!Number.isFinite(precioUsd) || precioUsd < 0 || precioUsd > 1000000000) { errores.push({ fila: rowNumber, campo: 'Precio US$', motivo: 'Debe ser un precio no negativo válido.' }); valid = false; }
    if (!valid) continue;
    seenPartNumbers.add(partNumber.toUpperCase());
    filasCorrectas++;
    filas.push({ partNumber, descripcion, cantidad, precioUsd: Number(precioUsd.toFixed(2)), categoria });
  }
  if (!totalFilas) errores.push({ fila: 2, campo: 'archivo', motivo: 'No se detectaron filas de productos.' });
  return { totalFilas, filasCorrectas, filas: errores.length ? [] : filas, errores };
}

function extractFile(body) {
  assertOnly(body, ['idMayorista', 'archivoBase64', 'formato', 'nombreArchivo']);
  const supplierId = normalizeSupplierId(body.idMayorista);
  if (body.formato !== 'XLSX' || typeof body.archivoBase64 !== 'string' || !body.archivoBase64.length || body.archivoBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.archivoBase64)) {
    throw error(400, 'Se requiere un archivo XLSX codificado en Base64.');
  }
  const buffer = Buffer.from(body.archivoBase64, 'base64');
  if (!buffer.length || buffer.length > MAX_FILE_BYTES) throw error(413, 'El archivo supera el tamaño máximo de 10 MB.');
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw error(400, 'El archivo no es un XLSX válido.');
  return { supplierId, buffer, contentHash: createHash('sha256').update(buffer).digest('hex') };
}

function idempotencyKey(req) {
  const key = text(req.get('Idempotency-Key'), 160);
  if (!key) throw error(400, 'La cabecera Idempotency-Key es obligatoria.');
  return key;
}

function batchStatus(batch) {
  return {
    idLote: batch.batchId,
    estado: batch.estado,
    totalFilas: batch.totalFilas,
    filasCorrectas: batch.filasCorrectas,
    filasErroneas: batch.errores?.length || 0,
    versionInventario: batch.versionInventario || undefined,
    actualizadoEn: batch.updatedAt,
  };
}

function validationReport(batch) {
  return {
    idLote: batch.batchId,
    estado: batch.estado,
    esValido: batch.estado === 'VALIDADO' || batch.estado === 'PROCESADO',
    filasCorrectas: batch.filasCorrectas,
    filasErroneas: batch.errores?.length || 0,
    errores: batch.errores || [],
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pagination(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 50 : Number(query.pageSize);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) throw error(400, 'Paginación inválida.');
  return { page, pageSize };
}

async function allocateVersion(session) {
  const options = { new: true, upsert: true, setDefaultsOnInsert: true };
  if (session) options.session = session;
  const version = await StockVersion.findOneAndUpdate({ _id: 'supplier-stock' }, { $inc: { sequence: 1 } }, options);
  return `INV-${String(version.sequence).padStart(6, '0')}`;
}

function transactionsUnavailable(err) {
  return /Transaction numbers are only allowed|does not support transactions|replica set|Transaction is not supported/i.test(err?.message || '');
}

async function applyBatch(batch, actorId) {
  const write = async session => {
    const versionInventario = await allocateVersion(session);
    const operations = batch.filas.map(row => ({
      updateOne: {
        filter: { supplierId: batch.supplierId, partNumber: row.partNumber },
        update: { $set: { descripcion: row.descripcion, cantidad: row.cantidad, precioUsd: row.precioUsd, categoria: row.categoria, versionInventario, lastBatchId: batch.batchId, updatedBy: actorId } },
        upsert: true,
      },
    }));
    const options = { ordered: true };
    if (session) options.session = session;
    await SupplierStock.bulkWrite(operations, options);
    return { idLote: batch.batchId, estado: 'PROCESADO', productosActualizados: operations.length, versionInventario };
  };
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await write(session); });
    return result;
  } catch (err) {
    // MongoDB local puede ejecutarse sin replica set. Conservamos la operación funcional
    // y el despliegue productivo usa la transacción anterior.
    if (!transactionsUnavailable(err)) throw err;
    return write(null);
  } finally {
    await session.endSession();
  }
}

const router = Router();
router.use(validateAuth);
router.use(async (req, res, next) => {
  if (req.user.role === 'mayorista') await getSupplier(req.user.supplierId, { activeOnly: true });
  if (!['GET', 'HEAD'].includes(req.method) && !['admin', 'mayorista'].includes(req.user.role)) return res.status(403).json({ message: 'No tienes permiso para modificar stock de mayoristas.' });
  next();
});

router.get('/proveedores', async (req, res) => {
  const filter = req.user.role === 'mayorista' ? { supplierId: req.user.supplierId } : {};
  const suppliers = await Supplier.find(filter).sort({ nombre: 1 }).lean();
  const accounts = req.user.role === 'admin' ? await User.find({ role: 'mayorista', supplierId: { $in: suppliers.map(supplier => supplier.supplierId) }, isActive: { $ne: false } }).select('_id email supplierId').lean() : [];
  res.json({ proveedores: suppliers.map(supplier => ({ ...publicSupplier(supplier), ...(req.user.role === 'admin' ? { accesos: accounts.filter(account => account.supplierId === supplier.supplierId).map(account => ({ id: String(account._id), email: account.email })) } : {}) })) });
});

router.post('/proveedores', requireAdmin, async (req, res) => {
  assertOnly(req.body, ['nombre', 'ruc', 'correoContacto', 'periodoActualizacionDias']);
  const nombre = text(req.body.nombre, 160);
  const ruc = req.body.ruc === undefined || req.body.ruc === '' ? undefined : text(req.body.ruc, 11);
  const correoContacto = text(req.body.correoContacto, 254)?.toLowerCase();
  const periodoActualizacionDias = req.body.periodoActualizacionDias === undefined ? 30 : Number(req.body.periodoActualizacionDias);
  if (!nombre || (ruc && !/^\d{11}$/.test(ruc)) || !isEmail(correoContacto) || !Number.isInteger(periodoActualizacionDias) || periodoActualizacionDias < 1 || periodoActualizacionDias > 365) throw error(400, 'Datos del proveedor inválidos.');
  const supplierId = `MAY-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  const supplier = await Supplier.create({ supplierId, nombre, ...(ruc ? { ruc } : {}), correoContacto, periodoActualizacionDias, notificationSyncStatus: 'pending', notificationRevision: 1 });
  res.status(201).json({ proveedor: publicSupplier(supplier) });
});

router.put('/proveedores/:idMayorista', requireAdmin, async (req, res) => {
  assertOnly(req.body, ['nombre', 'ruc', 'correoContacto', 'periodoActualizacionDias', 'activo']);
  const updates = {};
  if ('nombre' in req.body) { const value = text(req.body.nombre, 160); if (!value) throw error(400, 'Nombre inválido.'); updates.nombre = value; }
  if ('ruc' in req.body) { const value = req.body.ruc === '' ? undefined : text(req.body.ruc, 11); if (value && !/^\d{11}$/.test(value)) throw error(400, 'RUC inválido.'); updates.ruc = value; }
  if ('correoContacto' in req.body) { const value = text(req.body.correoContacto, 254)?.toLowerCase(); if (!isEmail(value)) throw error(400, 'Correo inválido.'); updates.correoContacto = value; }
  if ('periodoActualizacionDias' in req.body) { const value = Number(req.body.periodoActualizacionDias); if (!Number.isInteger(value) || value < 1 || value > 365) throw error(400, 'Periodo inválido.'); updates.periodoActualizacionDias = value; }
  if ('activo' in req.body) { if (typeof req.body.activo !== 'boolean') throw error(400, 'Estado inválido.'); updates.activo = req.body.activo; }
  if (!Object.keys(updates).length) throw error(400, 'No se recibieron cambios.');
  const supplierId = normalizeSupplierId(req.params.idMayorista);
  const prior = await Supplier.findOne({ supplierId }); if (!prior) throw error(404, 'Mayorista no encontrado.');
  if ('activo' in updates && updates.activo === false && prior.activo) { updates.notificationCancelPending = prior.notificationsEnabled !== false; updates.notificationSyncStatus = prior.notificationsEnabled === false ? 'synced' : 'pending'; updates.notificationRevision = (prior.notificationRevision || 1) + 1; }
  else if ('activo' in updates && updates.activo === true && !prior.activo) { updates.notificationCancelPending = false; if (prior.notificationsEnabled !== false) updates.notificationSyncStatus = 'pending'; updates.notificationRevision = (prior.notificationRevision || 1) + 1; }
  else if (['nombre','correoContacto','periodoActualizacionDias'].some(k => k in updates)) { updates.notificationSyncStatus = 'pending'; updates.notificationRevision = (prior.notificationRevision || 1) + 1; }
  const supplier = await Supplier.findOneAndUpdate({ supplierId }, { $set: updates }, { new: true, runValidators: true });
  res.json({ proveedor: publicSupplier(supplier) });
});

router.get('/notificaciones', requireAdmin, async (_req, res) => {
  const suppliers = await Supplier.find().sort({nombre:1}).lean();
  const latest = await StockBatch.aggregate([{ $match: { estado: 'PROCESADO', processedAt: { $ne: null } } }, { $sort: { processedAt: -1 } }, { $group: { _id: '$supplierId', processedAt: { $first: '$processedAt' } } }]);
  const dates = new Map(latest.map(x => [x._id, x.processedAt]));
  const outbox = await NotificationOutbox.aggregate([{ $sort: { createdAt: -1 } }, { $group: { _id: '$supplierId', status: { $first: '$status' }, attempts: { $first: '$attempts' }, lastError: { $first: '$lastError' } } }]);
  const jobs = new Map(outbox.map(x => [x._id, x]));
  res.json({ items: suppliers.map(s => { const baseline = dates.get(s.supplierId) || s.createdAt; const job = jobs.get(s.supplierId); return { idMayorista: s.supplierId, nombre: s.nombre, correoContacto: s.correoContacto, periodoActualizacionDias: s.periodoActualizacionDias, activo: s.activo, notificacionesActivas: s.notificationsEnabled !== false, mensajeAdicional: s.additionalMessage || '', ultimaActualizacion: baseline, proximaActualizacion: new Date(new Date(baseline).getTime()+s.periodoActualizacionDias*86400000), sincronizacion: s.notificationSyncStatus || 'pending', estadoCola: job?.status || 'pending', intentos: job?.attempts || 0, error: job?.lastError || null }; }) });
});
router.put('/notificaciones/:idMayorista/estado', requireAdmin, async (req,res) => {
  assertOnly(req.body,['activa']); if(typeof req.body.activa!=='boolean') throw error(400,'Estado de notificaciones inválido.');
  const supplierId=normalizeSupplierId(req.params.idMayorista); const supplier=await Supplier.findOne({supplierId}); if(!supplier) throw error(404,'Mayorista no encontrado.');
  if(req.body.activa && !supplier.activo) throw error(409,'Activa primero al proveedor para reanudar sus notificaciones.');
  if(supplier.notificationsEnabled===req.body.activa) return res.json({message:'El estado de notificaciones ya estaba actualizado.',notificacionesActivas:supplier.notificationsEnabled,proveedor:publicSupplier(supplier)});
  supplier.notificationsEnabled=req.body.activa; supplier.notificationRevision=(supplier.notificationRevision||1)+1; supplier.notificationSyncStatus='pending'; supplier.notificationCancelPending=!req.body.activa; await supplier.save();
  const eventType=req.body.activa?'sync-schedule':'cancel-schedule'; const prefix=req.body.activa?'schedule':'cancel';
  await enqueueNotification(prefix+':'+supplierId+':'+supplier.notificationRevision,eventType,supplierId);
  res.json({message:req.body.activa?'Notificaciones reactivadas; la programación se sincronizará en segundo plano.':'Recordatorios cancelados; la solicitud de cancelación se enviará en segundo plano.',notificacionesActivas:supplier.notificationsEnabled,proveedor:publicSupplier(supplier)});
});
router.put('/notificaciones/:idMayorista/mensaje', requireAdmin, async (req,res) => {
  assertOnly(req.body,['mensajeAdicional']); const value=req.body.mensajeAdicional; if(typeof value!=='string'||value.length>500||/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) throw error(400,'El mensaje admite texto plano de hasta 500 caracteres.');
  const supplierId=normalizeSupplierId(req.params.idMayorista); const supplier=await Supplier.findOne({supplierId}); if(!supplier) throw error(404,'Mayorista no encontrado.'); supplier.additionalMessage=value.trim(); if(supplier.activo && supplier.notificationsEnabled!==false){ supplier.notificationSyncStatus='pending'; supplier.notificationRevision=(supplier.notificationRevision||1)+1; await supplier.save(); await enqueueNotification('schedule:'+supplierId+':'+supplier.notificationRevision,'sync-schedule',supplierId); } else await supplier.save(); res.json({message:supplier.notificationsEnabled===false?'Mensaje guardado; se usará si se reactivan las notificaciones.':'Mensaje guardado; se sincronizará con notificaciones.',proveedor:publicSupplier(supplier)});
});

router.post('/proveedores/:idMayorista/usuarios', requireAdmin, async (req, res) => {
  assertOnly(req.body, ['email', 'password']);
  const supplierId = normalizeSupplierId(req.params.idMayorista);
  await getSupplier(supplierId, { activeOnly: true });
  const email = text(req.body.email, 254)?.toLowerCase();
  const password = req.body.password;
  if (!isEmail(email) || typeof password !== 'string' || [...password].length < 15 || Buffer.byteLength(password) > 72) throw error(400, 'Correo o contraseña inválidos.');
  if (await User.exists({ supplierId, role: 'mayorista', isActive: { $ne: false } })) throw error(409, 'El mayorista ya tiene acceso.');
  const user = await User.create({ email, password, role: 'mayorista', supplierId });
  res.status(201).json({ usuario: { id: String(user._id), email: user.email, role: user.role, idMayorista: supplierId } });
});

router.put('/proveedores/:idMayorista/usuarios/:idUsuario/password', requireAdmin, async (req, res) => {
  assertOnly(req.body, ['password']);
  const supplierId = normalizeSupplierId(req.params.idMayorista);
  await getSupplier(supplierId, { activeOnly: true });
  const password = req.body.password;
  if (!mongoose.isObjectIdOrHexString(req.params.idUsuario) || typeof password !== 'string' || [...password].length < 15 || Buffer.byteLength(password) > 72) throw error(400, 'Contraseña o usuario inválidos.');
  const user = await User.findOne({ _id: req.params.idUsuario, supplierId, role: 'mayorista', isActive: { $ne: false } }).select('+password');
  if (!user) throw error(404, 'Cuenta no encontrada.');
  user.password = password;
  await user.save();
  await Session.deleteMany({ userId: user._id });
  res.json({ message: 'Contraseña actualizada. Las sesiones anteriores se cerraron.' });
});

router.post('/upload', async (req, res) => {
  const key = idempotencyKey(req);
  const { supplierId, buffer, contentHash } = extractFile(req.body);
  ensureSupplierAccess(req, supplierId);
  await getSupplier(supplierId, { activeOnly: true });
  const existing = await StockBatch.findOne({ supplierId, idempotencyKey: key });
  if (existing) {
    if (existing.contentHash !== contentHash) throw error(409, 'La clave de idempotencia ya fue usada con otro archivo.');
    return res.status(202).json({ idLote: existing.batchId, estado: existing.estado, estadoUrl: `/api/v1/stock/lotes/${existing.batchId}` });
  }
  const result = await parseWorkbook(buffer);
  const batchId = `LOTE-${new Date().getUTCFullYear()}-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  let batch;
  try {
    batch = await StockBatch.create({ batchId, supplierId, idempotencyKey: key, contentHash, nombreArchivo: text(req.body.nombreArchivo, 200) || 'stock.xlsx', uploadedBy: req.user._id, estado: result.errores.length ? 'RECHAZADO' : 'VALIDADO', ...result });
  } catch (err) {
    if (err?.code !== 11000) throw err;
    const duplicate = await StockBatch.findOne({ supplierId, idempotencyKey: key });
    if (duplicate?.contentHash === contentHash) return res.status(202).json({ idLote: duplicate.batchId, estado: duplicate.estado, estadoUrl: `/api/v1/stock/lotes/${duplicate.batchId}` });
    throw error(409, 'La clave de idempotencia ya fue usada con otro archivo.');
  }
  await Archive.create({ batchId: batch.batchId, data: buffer });
  // El contrato devuelve 202 para que el consumidor siempre consulte la validación del lote.
  res.status(202).json({ idLote: batch.batchId, estado: 'RECIBIDO', estadoUrl: `/api/v1/stock/lotes/${batch.batchId}` });
});

router.get('/upload/:idLote/validate', async (req, res) => {
  const batch = await StockBatch.findOne({ batchId: text(req.params.idLote, 80) || '' });
  if (!batch) throw error(404, 'Lote no encontrado.');
  ensureSupplierAccess(req, batch.supplierId);
  if (batch.estado === 'RECIBIDO' || batch.estado === 'VALIDANDO') return res.status(202).json(validationReport(batch));
  res.json(validationReport(batch));
});

router.get('/historial', async (req, res) => {
  const { page, pageSize } = pagination(req.query);
  const filter = {};
  if (req.user.role === 'mayorista') filter.supplierId = req.user.supplierId;
  if (req.query.idMayorista) {
    const id = normalizeSupplierId(req.query.idMayorista);
    ensureSupplierAccess(req, id); filter.supplierId = id;
  }
  if (req.query.fecha) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha)) throw error(400, 'Fecha inválida.');
    const start = new Date(req.query.fecha + 'T00:00:00-05:00');
    if (!Number.isFinite(start.getTime())) throw error(400, 'Fecha inválida.');
    filter.createdAt = { $gte: start, $lt: new Date(start.getTime() + 86400000) };
  }
  const [items, total] = await Promise.all([
    StockBatch.find(filter).select('batchId supplierId nombreArchivo estado filasCorrectas createdAt processedAt').sort({ createdAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
    StockBatch.countDocuments(filter)
  ]);
  res.json({ items, total, page, pageSize });
});
router.get('/lotes/:idLote/preview', async (req, res) => {
  const batch = await StockBatch.findOne({ batchId: req.params.idLote }).lean();
  if (!batch) throw error(404, 'Lote no encontrado.');
  ensureSupplierAccess(req, batch.supplierId);
  const { page, pageSize } = pagination(req.query);
  res.json({ items: batch.filas.slice((page - 1) * pageSize, page * pageSize), total: batch.filas.length, errores: batch.errores, estado: batch.estado });
});
router.get('/lotes/:idLote/excel', async (req, res) => {
  const batch = await StockBatch.findOne({ batchId: req.params.idLote }).lean();
  if (!batch) throw error(404, 'Lote no encontrado.');
  ensureSupplierAccess(req, batch.supplierId);
  if (req.query.formato && req.query.formato !== 'presentacion') throw error(400, 'Formato de descarga inválido.');
  if (req.query.formato === 'presentacion') {
    const buffer = await presentationWorkbook(batch);
    return res.json({ nombreArchivo: batch.supplierId + '-' + batch.createdAt.toISOString().slice(0, 10) + '-' + batch.batchId + '.xlsx', archivoBase64: buffer.toString('base64'), original: false });
  }
  const file = await Archive.findOne({ batchId: batch.batchId });
  let buffer = file?.data;
  if (!buffer) {
    const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('Stock');
    sheet.addRow(['PartNumber', 'Descripción', 'QTY', 'Precio US$']);
    batch.filas.forEach(row => sheet.addRow([row.partNumber, row.descripcion, row.cantidad, row.precioUsd]));
    buffer = Buffer.from(await book.xlsx.writeBuffer());
  }
  res.json({ nombreArchivo: file ? (batch.nombreArchivo || 'stock.xlsx') : batch.batchId + '-reconstruido.xlsx', archivoBase64: buffer.toString('base64'), original: Boolean(file) });
});
router.get('/lotes/:idLote', async (req, res) => {
  const batch = await StockBatch.findOne({ batchId: text(req.params.idLote, 80) || '' });
  if (!batch) throw error(404, 'Lote no encontrado.');
  ensureSupplierAccess(req, batch.supplierId);
  res.json(batchStatus(batch));
});

router.post('/lotes/:idLote/confirmacion', async (req, res) => {
  const confirmationKey = idempotencyKey(req);
  assertOnly(req.body, ['idOperacion']);
  const idOperacion = req.body.idOperacion === undefined ? undefined : text(req.body.idOperacion, 100);
  if (req.body.idOperacion !== undefined && (!idOperacion || !SIMPLE_ID.test(idOperacion))) throw error(400, 'Identificador de operación inválido.');
  const batchId = text(req.params.idLote, 80);
  if (!batchId) throw error(400, 'Lote inválido.');
  let batch = await StockBatch.findOne({ batchId });
  if (!batch) throw error(404, 'Lote no encontrado.');
  ensureSupplierAccess(req, batch.supplierId);
  if (batch.estado === 'PROCESADO') { const batchSupplier = await Supplier.findOne({ supplierId: batch.supplierId }).select('notificationsEnabled').lean(); if(batchSupplier?.notificationsEnabled!==false) await enqueueNotification('catalog:' + batch.batchId, 'catalog-updated', batch.supplierId, { catalogAt: batch.processedAt }); return res.json(batch.confirmationResult); }
  if (batch.estado !== 'VALIDADO') throw error(409, 'El lote no se puede confirmar en su estado actual.');
  batch = await StockBatch.findOneAndUpdate({ _id: batch._id, estado: 'VALIDADO' }, { $set: { estado: 'PROCESANDO', confirmationKey, ...(idOperacion ? { idOperacion } : {}) } }, { new: true });
  if (!batch) {
    const current = await StockBatch.findOne({ batchId });
    if (current?.estado === 'PROCESADO') { const batchSupplier = await Supplier.findOne({ supplierId: current.supplierId }).select('notificationsEnabled').lean(); if(batchSupplier?.notificationsEnabled!==false) await enqueueNotification('catalog:' + current.batchId, 'catalog-updated', current.supplierId, { catalogAt: current.processedAt }); return res.json(current.confirmationResult); }
    throw error(409, 'El lote ya está siendo procesado.');
  }
  try {
    const result = await applyBatch(batch, req.user._id);
    const processedAt = new Date();
    await StockBatch.updateOne({ _id: batch._id, estado: 'PROCESANDO' }, { $set: { estado: 'PROCESADO', versionInventario: result.versionInventario, confirmationResult: result, processedAt } });
    const batchSupplier = await Supplier.findOne({ supplierId: batch.supplierId }).select('notificationsEnabled').lean();
    if (batchSupplier?.notificationsEnabled !== false) await enqueueNotification('catalog:' + batch.batchId, 'catalog-updated', batch.supplierId, { catalogAt: processedAt });
    res.json(result);
  } catch (err) {
    await StockBatch.updateOne({ _id: batch._id, estado: 'PROCESANDO' }, { $set: { estado: 'FALLIDO' } });
    throw err;
  }
});

router.get('/products', async (req, res) => {
  const { page, pageSize } = pagination(req.query);
  const filter = {};
  const requestedSupplier = req.query.idMayorista === undefined ? null : normalizeSupplierId(req.query.idMayorista);
  if (req.user.role === 'mayorista') {
    if (requestedSupplier && requestedSupplier !== req.user.supplierId) throw error(403, 'No tienes permiso para este mayorista.');
    filter.supplierId = req.user.supplierId;
  } else if (requestedSupplier) filter.supplierId = requestedSupplier;
  if (req.query.codigo !== undefined) { const value = text(req.query.codigo, 160); if (!value) throw error(400, 'Código inválido.'); filter.partNumber = new RegExp(escapeRegex(value), 'i'); }
  if (req.query.nombre !== undefined) { const value = text(req.query.nombre, 160); if (!value) throw error(400, 'Nombre inválido.'); filter.descripcion = new RegExp(escapeRegex(value), 'i'); }
  if (req.query.categoria !== undefined) { const value = text(req.query.categoria, 160); if (!value) throw error(400, 'Categoría inválida.'); filter.categoria = value; }
  const [products, total] = await Promise.all([
    SupplierStock.find(filter).sort({ supplierId: 1, partNumber: 1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
    SupplierStock.countDocuments(filter),
  ]);
  const supplierIds = [...new Set(products.map(product => product.supplierId))];
  const suppliers = supplierIds.length ? await Supplier.find({ supplierId: { $in: supplierIds } }).select({ supplierId: 1, nombre: 1 }).lean() : [];
  const supplierNames = new Map(suppliers.map(supplier => [supplier.supplierId, supplier.nombre]));
  res.json({ versionInventario: products[0]?.versionInventario || null, total, page, pageSize, productos: products.map(product => publicProduct(product, supplierNames)) });
});

router.get('/categories', async (req, res) => {
  const match = {};
  const requestedSupplier = req.query.idMayorista === undefined ? null : normalizeSupplierId(req.query.idMayorista);
  if (req.user.role === 'mayorista') {
    if (requestedSupplier && requestedSupplier !== req.user.supplierId) throw error(403, 'No tienes permiso para este mayorista.');
    match.supplierId = req.user.supplierId;
  } else if (requestedSupplier) match.supplierId = requestedSupplier;
  if (req.query.categoria !== undefined) { const category = text(req.query.categoria, 160); if (!category) throw error(400, 'Categoría inválida.'); match.categoria = category; }
  const groups = await SupplierStock.aggregate([{ $match: match }, { $group: { _id: '$categoria', totalItems: { $sum: 1 }, unidadesDisponibles: { $sum: '$cantidad' } } }, { $sort: { _id: 1 } }]);
  if (req.query.categoria !== undefined) {
    const group = groups[0] || { _id: req.query.categoria, totalItems: 0, unidadesDisponibles: 0 };
    return res.json({ categoria: group._id, totalItems: group.totalItems, unidadesDisponibles: group.unidadesDisponibles });
  }
  res.json({ grupos: groups.map(group => ({ categoria: group._id, totalItems: group.totalItems, unidadesDisponibles: group.unidadesDisponibles })) });
});

router.put('/products/:idProducto', async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.idProducto)) throw error(400, 'Producto inválido.');
  assertOnly(req.body, ['idMayorista', 'stockNuevo', 'motivo', 'versionEsperada']);
  const product = await SupplierStock.findById(req.params.idProducto).lean();
  if (!product) throw error(404, 'Producto no encontrado.');
  ensureSupplierAccess(req, product.supplierId);
  const supplierId = normalizeSupplierId(req.body.idMayorista);
  const stockNuevo = req.body.stockNuevo;
  const motivo = text(req.body.motivo, 300);
  const versionEsperada = text(req.body.versionEsperada, 64);
  if (supplierId !== product.supplierId || !Number.isInteger(stockNuevo) || stockNuevo < 0 || !motivo || !versionEsperada || versionEsperada !== product.versionInventario) throw error(400, 'Datos de ajuste inválidos.');
  const versionInventario = await allocateVersion(null);
  const updated = await SupplierStock.findOneAndUpdate({ _id: product._id, versionInventario: versionEsperada }, { $set: { cantidad: stockNuevo, versionInventario, updatedBy: req.user._id } }, { new: true, runValidators: true });
  if (!updated) throw error(409, 'Conflicto de versión. Actualiza los datos antes de reintentar.');
  res.json({ idProducto: String(updated._id), stockAnterior: product.cantidad, stockActual: updated.cantidad, versionInventario: updated.versionInventario });
});

export default router;
export const __testing = { parseWorkbook, extractFile };

