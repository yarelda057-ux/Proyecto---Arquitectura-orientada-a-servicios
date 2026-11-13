export function auditConfig() {
  if (process.env.AUDIT_ENABLED !== 'true') return null;
  const url = new URL(process.env.AUDIT_SERVICE_URL || 'http://127.0.0.1:8001');
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) {
    throw new Error('AUDIT_SERVICE_URL requiere HTTPS (HTTP solo en loopback para desarrollo).');
  }
  const writeKey = process.env.AUDIT_WRITE_KEY;
  const readKey = process.env.AUDIT_READ_KEY;
  if (!writeKey || writeKey.length < 32 || !readKey || readKey.length < 32 || writeKey === readKey) throw new Error('Configura claves de auditoría distintas de al menos 32 caracteres.');
  return { url: url.origin, writeKey, readKey };
}
export async function sendAuditEvent(event, config = auditConfig()) {
  if (!config) throw new Error('Auditoría no configurada');
  return fetch(`${config.url}/v1/events`, { method: 'POST', redirect: 'error',
    headers: { Authorization: `Bearer ${config.writeKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(event), signal: AbortSignal.timeout(3000) });
}
export async function queryAudit(query, config = auditConfig()) {
  if (!config) { const error = new Error('Auditoría no configurada.'); error.status = 503; throw error; }
  const allowed = new Set(['limit', 'cursor', 'actor_id', 'method', 'path', 'status_code', 'since', 'until']);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (!allowed.has(key) || typeof value !== 'string' || value.length > 1024) { const error = new Error('Filtro inválido'); error.status = 400; throw error; }
    if (value) params.set(key, value);
  }
  const response = await fetch(`${config.url}/v1/events?${params}`, { redirect: 'error',
    headers: { Authorization: `Bearer ${config.readKey}` }, signal: AbortSignal.timeout(5000) });
  if (!response.ok) { const error = new Error('Consulta de auditoría fallida'); error.status = response.status === 422 ? 400 : 503; throw error; }
  return response.json();
}
