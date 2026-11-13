import { useContext, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { SfpContext } from '../context/authContext';
import { api } from '../services/http';
const roleLabels = { admin: 'Administrador', user: 'Operario', mayorista: 'Mayorista' };
const empty = { actor_id: '', method: '', path: '', status_code: '', since: '', until: '' };
function AuditViewer() {
  const [form, setForm] = useState(empty);
  const [filters, setFilters] = useState({});
  const [cursor, setCursor] = useState('');
  const [history, setHistory] = useState([]);
  const [page, setPage] = useState({ items: [], next_cursor: null });
  const [delivery, setDelivery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    const params = new URLSearchParams({ ...filters, limit: '50', ...(cursor ? { cursor } : {}) });
    Promise.all([api(`/audit/events?${params}`, { signal: controller.signal }), api('/audit/delivery', { signal: controller.signal })])
      .then(([data, state]) => { if (!controller.signal.aborted) { setPage(data); setDelivery(state); } })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, cursor]);
  function submit(event) {
    event.preventDefault();
    if (form.since && form.until && new Date(form.since) > new Date(form.until)) { setError('La fecha inicial debe ser anterior a la final.'); return; }
    const query = Object.fromEntries(Object.entries(form).filter(([, value]) => value));
    for (const key of ['since', 'until']) if (query[key]) query[key] = new Date(query[key]).toISOString();
    setCursor(''); setHistory([]); setFilters(query);
  }
  return <main className="workspace"><div className="page-heading"><div><span className="eyebrow">SUPERVISIÓN / AUDITORÍA</span><h1>Actividad del sistema</h1><p className="text-secondary">Accesos y operaciones del inventario. Registros de solo lectura.</p></div><button className="btn btn-outline-secondary" disabled={loading} onClick={() => setFilters({ ...filters })}>Actualizar</button></div>
    {delivery && <div className={`alert ${delivery.failed || !delivery.enabled ? 'alert-warning' : 'alert-light'}`} role="status">{delivery.enabled ? 'Envío de auditoría activo' : 'Envío de auditoría desactivado'} · {delivery.pending} eventos pendientes · {delivery.failed} eventos requieren revisión</div>}
    <section className="panel mb-4"><form onSubmit={submit}><div className="audit-filters">{[['actor_id', 'ID de usuario', 'text'], ['path', 'Ruta exacta', 'text'], ['since', 'Desde (hora local)', 'datetime-local'], ['until', 'Hasta (hora local)', 'datetime-local']].map(([key, label, type]) => <div key={key}><label htmlFor={`audit-${key}`}>{label}</label><input className="form-control" id={`audit-${key}`} type={type} maxLength={key === 'actor_id' ? 128 : 1024} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></div>)}<div><label htmlFor="audit-method">Operación</label><select id="audit-method" className="form-select" value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}><option value="">Todas</option>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map(method => <option key={method}>{method}</option>)}</select></div><div><label htmlFor="audit-status">Estado HTTP</label><input id="audit-status" className="form-control" type="number" min="100" max="599" value={form.status_code} onChange={e => setForm({ ...form, status_code: e.target.value })} placeholder="Ej. 401" /></div></div><div className="d-flex gap-2 mt-3"><button className="btn btn-primary" disabled={loading}>Aplicar filtros</button><button type="button" className="btn btn-outline-secondary" onClick={() => { setForm(empty); setFilters({}); setCursor(''); setHistory([]); }}>Limpiar</button></div></form></section>
    <section className="panel inventory-panel">{loading ? <div className="empty-state" role="status">Consultando actividad…</div> : error ? <div className="empty-state"><p role="alert">{error}</p><button className="btn btn-primary" onClick={() => setFilters({ ...filters })}>Reintentar</button></div> : page.items.length === 0 ? <div className="empty-state"><h2>Sin registros para esta consulta</h2><p>Los eventos pueden tardar unos segundos en llegar. Ajusta los filtros o actualiza la consulta.</p></div> : <div className="table-responsive"><table className="table inventory-table"><caption className="visually-hidden">Registros de auditoría del inventario</caption><thead><tr><th>Fecha y hora local</th><th>Usuario</th><th title="Rol actual de la cuenta">Rol</th><th>Operación</th><th>Ruta</th><th>Estado</th><th>Duración</th></tr></thead><tbody>{page.items.map(event => <tr key={event.id}><td><time dateTime={event.occurred_at} title={`UTC: ${event.occurred_at}`}>{new Date(event.occurred_at).toLocaleString('es-PE')}</time><span className="product-description">{event.source}</span></td><td><span>{event.actor_email || (event.actor_id ? 'Usuario no disponible' : 'No autenticado')}</span>{event.actor_id && <details><summary className="small text-secondary">ID de usuario</summary><code>{event.actor_id}</code></details>}</td><td><span className="status-pill audit-role" data-role={event.actor_role || ""}>{roleLabels[event.actor_role] || (event.actor_id ? "No disponible" : "No autenticado")}</span></td><td><span className="status-pill">{event.method}</span></td><td className="audit-path"><code>{event.path}</code><details><summary className="small text-secondary">Identificadores</summary><small>Evento: {event.event_id}<br />Solicitud: {event.request_id}</small></details></td><td><span className={`status-pill ${event.status_code < 400 ? 'status-new' : ''}`}>{event.status_code}</span></td><td>{event.duration_ms} ms</td></tr>)}</tbody></table></div>}
      <div className="table-summary d-flex justify-content-between align-items-center"><span>Hasta 50 registros por página · más recientes primero</span><div className="d-flex gap-2"><button className="btn btn-sm btn-outline-secondary" disabled={loading || !history.length} onClick={() => { setCursor(history[history.length - 1]); setHistory(history.slice(0, -1)); }}>Anterior</button><button className="btn btn-sm btn-outline-secondary" disabled={loading || Boolean(error) || !page.next_cursor} onClick={() => { setHistory([...history, cursor]); setCursor(page.next_cursor); }}>Siguiente</button></div></div></section>
    <p className="small text-secondary mt-3">La columna Rol muestra el rol actual de la cuenta. No se registran contraseñas, tokens ni cuerpos de solicitudes. “No autenticado” indica que no se confirmó una identidad para esa operación.</p>
  </main>;
}
export default function Logs() {
  const { user } = useContext(SfpContext);
  return user?.role === 'admin' ? <AuditViewer /> : <Navigate to="/Account" replace />;
}
