const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
export async function api(path, { method = 'GET', body, signal, headers = {} } = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method, credentials: 'include', signal,
      headers: { 'X-Requested-With': 'QuanticWeb', ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {}),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('No se pudo conectar con el servidor. Revisa tu conexión e inténtalo nuevamente.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && path !== '/users/login') window.dispatchEvent(new Event('session-expired'));
    const error = new Error(data?.message || 'No se pudo completar la solicitud.');
    error.status = response.status;
    throw error;
  }
  if (!data) throw new Error('El servidor devolvió una respuesta inesperada.');
  return data;
}
