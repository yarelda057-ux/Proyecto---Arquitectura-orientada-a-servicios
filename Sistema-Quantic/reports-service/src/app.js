import { buildReport, reportInput } from './exportReport.js';
import { reportAttachment } from './reportFiles.js';
import { randomUUID } from 'node:crypto';
import { createApiDocs } from '../apiDocs.cjs';
import { authenticate } from './auth.js';
import { calculate, dashboardResult, olderThan, fail, filters, indicators, object, text, version } from './domain.js';
const apiDocs = createApiDocs({ specPath: new URL('../openapi.json', import.meta.url), title: 'Reportes y Dashboards de Inventario' });

async function readBody(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw fail(400, 'Se requiere JSON.');
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 65536) throw fail(413, 'Solicitud demasiado grande.'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail(400, 'JSON inválido.'); }
}
function dashboardInput(body, updating) {
  object(body, ['nombre', 'indicadores', 'filtros', ...(updating ? ['versionInventario'] : [])]);
  const nombre = text(body.nombre);
  if (!Array.isArray(body.indicadores) || !body.indicadores.length || body.indicadores.length > indicators.length || new Set(body.indicadores).size !== body.indicadores.length || body.indicadores.some(i => !indicators.includes(i))) throw fail(400, 'Indicadores inválidos.');
  return { nombre, indicadores: body.indicadores, filtros: filters(body.filtros), ...(updating ? { versionInventario: version(body.versionInventario) } : {}) };
}
export function createHandler({ clients, repository, source }) {
  return async (req, res) => {
    const suppliedId = req.headers['x-correlation-id'];
    const correlationId = typeof suppliedId === 'string' && /^[A-Za-z0-9._:-]{1,100}$/.test(suppliedId) ? suppliedId : randomUUID();
    res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Correlation-ID', correlationId);
    const send = (status, data) => { res.statusCode = status; res.end(JSON.stringify(data)); };
    try {
      if (apiDocs(req, res)) return;
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && ['/health/live', '/health/ready'].includes(url.pathname)) { if (url.pathname.endsWith('ready')) repository.ping(); return send(200, { status: 'ok', servicio: 'SRV-G5202604' }); }
      const scope = ['GET', 'HEAD'].includes(req.method) ? 'reports:read' : 'reports:write';
      const identity = authenticate(req.headers.authorization, clients, scope);
      const path = url.pathname.replace(/^\/api\/v1\/inventario/, '');
      if (path === url.pathname) throw fail(404, 'Ruta no encontrada.');
      const body = ['POST', 'PUT'].includes(req.method) ? await readBody(req) : null;
      const query = Object.fromEntries(url.searchParams);
      if ([...url.searchParams.keys()].length !== Object.keys(query).length) throw fail(400, 'Filtros repetidos.');
      const snapshot = expected => source({ expected, token: req.headers['x-stock-authorization'], correlationId });
      const meta = r => ({ versionInventario: r.versionInventario, actualizadoEn: r.actualizadoEn, generadoEn: r.generadoEn, sinRegistros: r.sinRegistros });
      if (req.method === 'GET' && ['/indicadores', '/estadisticas'].includes(path)) {
        object(query, ['categoria', 'idMayorista', 'versionInventario', ...(path === '/estadisticas' ? ['agruparPor'] : [])]);
        if (path === '/estadisticas' && query.agruparPor !== 'categoria') throw fail(400, 'Solo se admite agruparPor=categoria.');
        const selected = filters(Object.fromEntries(Object.entries(query).filter(([k]) => ['categoria', 'idMayorista'].includes(k))));
        const r = calculate(await snapshot(query.versionInventario === undefined ? undefined : version(query.versionInventario)), selected);
        return send(200, { ...(path === '/indicadores' ? r.valores : { grupos: r.grupos }), ...meta(r) });
      }
      if (req.method === 'GET' && /^\/dashboards\/[A-Za-z0-9_-]{1,100}$/.test(path) && query.actual === 'true') {
        object(query, ['actual']);
        const config = repository.getDashboard(identity.clientId, path.split('/')[2]);
        if (!config) throw fail(404, 'Recurso inexistente.');
        const data = await snapshot();
        return send(200, { ...dashboardResult(config, data), configuracion: { nombre: config.nombre, indicadores: config.indicadores, filtros: config.filtros }, historico: false });
      }
      if (req.method === 'GET' && /^\/reportes\/[A-Za-z0-9_-]{1,100}$/.test(path) && query.formato) {
        object(query, ['formato']);
        if (!['PDF', 'EXCEL'].includes(query.formato)) throw fail(400, 'Formato invalido.');
        const saved = repository.getReport(identity.clientId, path.split('/')[2]);
        if (!saved?.valores) throw fail(404, 'Reporte exportable no encontrado.');
        const report = { ...saved, formato: query.formato };
        return send(200, { ...report, historico: true, ...reportAttachment(report) });
      }
      if (url.search) throw fail(400, 'La operación no admite parámetros de consulta.');
      if (req.method === 'POST' && path === '/actualizaciones') {
        object(body, ['idOperacion', 'versionInventario']);
        const idOperacion = text(body.idOperacion, 100), expected = version(body.versionInventario);
        const prior = repository.getUpdate(identity.clientId, idOperacion);
        if (prior) {
          if (prior.versionInventario !== expected) throw fail(409, 'Operacion reutilizada con otra version.');
          return send(200, prior);
        }
        const data = await snapshot(expected);
        const result = repository.transaction(() => {
          // Another request may have finished while the source was being fetched.
          const duplicate = repository.getUpdate(identity.clientId, idOperacion);
          if (duplicate) {
            if (duplicate.versionInventario !== expected) throw fail(409, 'Operacion reutilizada con otra version.');
            return duplicate;
          }
          const dashboards = repository.listDashboards(identity.clientId).map(config => {
            if (olderThan(data, config.resultado)) return { idDashboard: config.idDashboard, estado: 'SUPERADO', versionDashboard: config.resultado.versionInventario };
            const resultado = dashboardResult(config, data);
            repository.updateDashboard(identity.clientId, config.idDashboard, { ...config, versionInventario: expected, resultado });
            return { idDashboard: config.idDashboard, estado: 'ACTUALIZADO', versionDashboard: expected };
          });
          const receipt = { idOperacion, versionInventario: expected, dashboards, generadoEn: new Date().toISOString() };
          repository.saveUpdate(identity.clientId, idOperacion, receipt);
          return receipt;
        });
        return send(200, result);
      }
      if (req.method === 'POST' && path === '/reportes' && body.tipo !== 'stockActual') {
        const input = reportInput(body);
        const report = await buildReport(input, source, { token: req.headers['x-stock-authorization'], correlationId });
        const attachment = reportAttachment(report);
        repository.saveReport(identity.clientId, report.idReporte, report);
        return send(201, { ...report, ...attachment });
      }
      if (req.method === 'POST' && path === '/reportes') {
        object(body, ['tipo', 'formato', 'filtros', 'versionInventario']);
        if (body.tipo !== 'stockActual' || body.formato !== 'JSON') throw fail(400, 'Se admite tipo=stockActual y formato=JSON.');
        const selected = filters(body.filtros);
        const r = calculate(await snapshot(version(body.versionInventario)), selected);
        const report = { idReporte: 'REP-' + randomUUID(), tipo: body.tipo, formato: 'JSON', filtros: selected, datos: r.datos, ...meta(r) };
        repository.saveReport(identity.clientId, report.idReporte, report);
        return send(201, report);
      }
      if (req.method === 'POST' && path === '/dashboards') {
        const config = dashboardInput(body, false); const idDashboard = 'DASH-' + randomUUID();
        repository.createDashboard(identity.clientId, idDashboard, { idDashboard, ...config }); return send(201, { idDashboard, ...config });
      }
      const match = /^\/(dashboards|reportes)\/([A-Za-z0-9_-]{1,100})$/.exec(path);
      if (!match) throw fail(404, 'Ruta no encontrada.');
      const [, resource, id] = match;
      const existing = resource === 'dashboards' ? repository.getDashboard(identity.clientId, id) : repository.getReport(identity.clientId, id);
      if (!existing) throw fail(404, 'Recurso inexistente.');
      // GET devuelve configuración o un reporte histórico: nunca lo etiqueta como vigente.
      if (req.method === 'GET') return send(200, { ...existing, historico: true });
      if (resource === 'dashboards' && req.method === 'PUT') {
        const config = dashboardInput(body, true); const data = await snapshot(config.versionInventario);
        if (olderThan(data, repository.getDashboard(identity.clientId, id)?.resultado)) throw fail(409, 'El dashboard ya tiene una version mas reciente. Actualiza los datos.');
        const result = dashboardResult({ idDashboard: id, ...config }, data);
        repository.updateDashboard(identity.clientId, id, { idDashboard: id, ...config, resultado: result }); return send(200, result);
      }
      throw fail(405, 'Método no admitido.');
    } catch (err) { send(err.status || 503, { message: err.status ? err.message : 'Servicio de reportes no disponible.', correlationId }); }
  };
}
