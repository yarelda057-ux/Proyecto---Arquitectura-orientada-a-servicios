import { randomUUID } from 'node:crypto';

export async function additionalServicesRequest(path, correlationId = randomUUID()) {
  const key = process.env.INTEGRATION_ESB_KEY || '';
  if (key.length < 32) throw Object.assign(new Error('La conexión con servicios adicionales no está configurada.'), { status: 503 });
  try {
    const base = new URL(process.env.INTEGRATION_ESB_URL || 'http://127.0.0.1:8003');
    if (base.username || base.password || (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname) && process.env.NODE_ENV !== 'production'))) throw new Error('Invalid configuration');
    const response = await fetch(new URL('/v1/additional-services/' + path, base), {
      redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { Accept: 'application/json', 'X-ESB-Key': key, 'X-Correlation-ID': correlationId },
    });
    const data = await response.json();
    if (!response.ok) {
      const status = [400, 404, 504].includes(response.status) ? response.status : 503;
      const message = status === 404 ? 'El registro no está disponible en el catálogo.' : status === 400 ? 'Revisa los filtros de consulta.' : 'El servicio de servicios adicionales no está disponible. Inténtalo nuevamente.';
      throw Object.assign(new Error(message), { status });
    }
    return data;
  } catch (error) {
    if (error.status) throw error;
    throw Object.assign(new Error('El servicio de servicios adicionales no está disponible. Inténtalo nuevamente.'), { status: error.name === 'TimeoutError' ? 504 : 503 });
  }
}
