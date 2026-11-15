import { fail, validateSnapshot } from './domain.js';
export function sourceClient({ url, esbKey, fetchImpl = fetch }) {
  const endpoint = new URL(url);
  if (endpoint.username || endpoint.password || endpoint.hash || (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(endpoint.hostname) && process.env.NODE_ENV !== 'production'))) throw new Error('URL de fuente inválida: utiliza HTTPS o loopback local.');
  return async ({ token, correlationId, expected }) => {
    if (typeof token !== 'string' || !/^Bearer [A-Za-z0-9_.-]+$/.test(token)) throw fail(401, 'Falta la autorización para consultar la fuente.');
    const target = new URL(endpoint);
    if (expected) target.searchParams.set('versionInventario', expected);
    try {
      const response = await fetchImpl(target, { redirect: 'error', signal: AbortSignal.timeout(5000), headers: { Authorization: token, Accept: 'application/json', 'X-Correlation-ID': correlationId, ...(esbKey ? { 'X-ESB-Key': esbKey } : {}) } });
      if (!response.ok) throw fail([400, 401, 403, 409, 504].includes(response.status) ? response.status : 503, response.status === 409 ? 'La versión de inventario ya no está disponible.' : 'No se pudo consultar una versión vigente del inventario.');
      // Límite aplicado también cuando la fuente usa transferencia fragmentada.
      const chunks = []; let bytes = 0;
      for await (const chunk of response.body) { bytes += chunk.length; if (bytes > 32 * 1024 * 1024) throw fail(503, 'La fuente excede el límite de consulta.'); chunks.push(chunk); }
      return validateSnapshot(JSON.parse(Buffer.concat(chunks).toString('utf8')), expected);
    } catch (err) { throw err.status ? err : fail(err.name === 'TimeoutError' ? 504 : 503, 'Fuente de inventario no disponible.'); }
  };
}
