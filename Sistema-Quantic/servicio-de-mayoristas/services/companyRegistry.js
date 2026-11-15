import jwt from 'jsonwebtoken';
export async function companyByRuc(ruc, request = fetch) {
  if (!/^\d{11}$/.test(ruc || '')) throw Object.assign(new Error('Vincula el RUC del proveedor desde Servicios adicionales.'), { status: 403 });
  const key = process.env.COMPANY_INTEGRATION_KEY;
  if (!key || key.length < 32) throw Object.assign(new Error('Falta configurar el registro de empresas.'), { status: 503 });
  const base = new URL(process.env.COMPANY_SERVICE_URL || 'http://127.0.0.1:3002');
  if (base.username || base.password || (base.protocol !== 'https:' && !(base.protocol === 'http:' && process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(base.hostname)))) throw Object.assign(new Error('Registro de empresas no disponible.'), { status: 503 });
  const token = jwt.sign({ role: 'integration' }, key, { algorithm: 'HS256', subject: 'wholesale-stock', issuer: 'wholesale-integration', audience: 'company-api', expiresIn: 60 });
  let response;
  try { response = await request(new URL('/api/v1/integracion/empresas/ruc/' + ruc, base), { redirect: 'error', signal: AbortSignal.timeout(5000), headers: { Authorization: 'Bearer ' + token } }); }
  catch { throw Object.assign(new Error('No se pudieron verificar los permisos de la empresa.'), { status: 503 }); }
  if (response.status === 404) throw Object.assign(new Error('La empresa no esta registrada en Servicios adicionales.'), { status: 403 });
  if (!response.ok) throw Object.assign(new Error('No se pudieron verificar los permisos de la empresa.'), { status: 503 });
  let company;
  try { company = (await response.json()).empresa; } catch { /* Reject malformed responses. */ }
  if (company?.ruc !== ruc || !['PENDIENTE', 'APROBADO', 'INACTIVO', 'RECHAZADO'].includes(company.estado_verificacion) || ![true, false, 0, 1].includes(company.provee_equipos) || ![true, false, 0, 1].includes(company.ofrece_servicios)) throw Object.assign(new Error('Respuesta del registro invalida.'), { status: 503 });
  return company;
}
export function assertCompany(company, stock = false) {
  if (company.estado_verificacion !== 'APROBADO' || (stock && !Boolean(company.provee_equipos))) throw Object.assign(new Error(stock ? 'Esta empresa no tiene permiso para publicar stock.' : 'La empresa no esta aprobada.'), { status: 403 });
  return company;
}
