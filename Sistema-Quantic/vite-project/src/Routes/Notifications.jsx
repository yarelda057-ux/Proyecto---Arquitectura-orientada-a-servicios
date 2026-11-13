import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/http';

const dateText = value => value ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const data = await api('/v1/stock/notificaciones'); setItems(data.items); setDrafts(Object.fromEntries(data.items.map(item => [item.idMayorista, item.mensajeAdicional || '']))); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  async function save(item) {
    setBusy(item.idMayorista); setError(''); setMessage('');
    try { await api('/v1/stock/notificaciones/' + encodeURIComponent(item.idMayorista) + '/mensaje', { method: 'PUT', body: { mensajeAdicional: drafts[item.idMayorista] || '' } }); setMessage('Mensaje guardado; se sincronizará en segundo plano.'); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(''); }
  }
  async function toggle(item, activa) {
    setBusy(item.idMayorista); setError(''); setMessage('');
    try { const result = await api('/v1/stock/notificaciones/' + encodeURIComponent(item.idMayorista) + '/estado', { method: 'PUT', body: { activa } }); setMessage(result.message); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(''); }
  }
  return <main className="workspace">
    <div className="page-heading"><div><span className="eyebrow">ADMINISTRACIÓN / INTEGRACIÓN SOAP</span><h1>Notificaciones de proveedores</h1><p className="text-secondary">Las programaciones se crean al registrar al proveedor y se actualizan cuando una carga queda procesada.</p></div><button className="btn btn-outline-secondary" onClick={load} disabled={loading}>Actualizar estado</button></div>
    {error && <div className="alert alert-danger" role="alert">{error}</div>}{message && <div className="alert alert-success" role="status">{message}</div>}
    <section className="panel"><h2>Programaciones y sincronización</h2><p className="text-secondary">La última carga confirmada sirve como fecha de referencia. Si aún no existe, se usa la fecha de registro del proveedor. Puedes cancelar o reactivar sus recordatorios sin desactivar al proveedor.</p>
      {loading ? <div className="empty-state" role="status">Cargando programaciones…</div> : !items.length ? <div className="empty-state">No hay proveedores registrados.</div> : <div className="table-responsive"><table className="table align-middle"><thead><tr><th>Proveedor</th><th>Correo</th><th>Periodicidad</th><th>Última actualización</th><th>Próxima</th><th>Sincronización</th><th>Mensaje adicional</th><th>Acciones</th></tr></thead><tbody>
        {items.map(item => <tr key={item.idMayorista}>
          <td><strong>{item.nombre}</strong><small className="d-block text-secondary">{item.idMayorista} · {item.activo ? 'Activo' : 'Inactivo'}</small></td>
          <td>{item.correoContacto}</td><td>{item.periodoActualizacionDias} días</td><td>{dateText(item.ultimaActualizacion)}</td><td>{dateText(item.proximaActualizacion)}</td>
          <td><span className={'badge ' + (!item.notificacionesActivas && item.sincronizacion === 'synced' ? 'text-bg-secondary' : item.sincronizacion === 'synced' ? 'text-bg-success' : item.estadoCola === 'failed' ? 'text-bg-danger' : 'text-bg-warning')}>{!item.notificacionesActivas && item.sincronizacion === 'synced' ? 'Cancelada' : item.sincronizacion === 'synced' ? 'Sincronizado' : item.estadoCola === 'failed' ? 'Revisar error' : 'Pendiente'}</span>{item.intentos > 0 && <small className="d-block text-secondary">Intentos: {item.intentos}</small>}{item.error && <small className="d-block text-danger">{item.error}</small>}</td>
          <td style={{ minWidth: 240 }}><textarea className="form-control" maxLength="500" rows="2" aria-label={'Mensaje adicional para ' + item.nombre} value={drafts[item.idMayorista] || ''} onChange={event => setDrafts(current => ({ ...current, [item.idMayorista]: event.target.value }))} /><div className="d-flex justify-content-between mt-2"><small className="text-secondary">{(drafts[item.idMayorista] || '').length}/500</small><button className="btn btn-sm btn-primary" disabled={busy === item.idMayorista || (drafts[item.idMayorista] || '') === item.mensajeAdicional} onClick={() => save(item)}>{busy === item.idMayorista ? 'Guardando…' : 'Guardar'}</button></div></td>
          <td style={{ minWidth: 175 }}>{!item.activo ? <small className="text-secondary">Proveedor inactivo</small> : <button className={'btn btn-sm ' + (item.notificacionesActivas ? 'btn-outline-danger' : 'btn-outline-success')} disabled={busy === item.idMayorista} onClick={() => toggle(item, !item.notificacionesActivas)}>{busy === item.idMayorista ? 'Procesando…' : item.notificacionesActivas ? 'Cancelar recordatorios' : 'Reactivar recordatorios'}</button>}</td>
        </tr>)}
      </tbody></table></div>}
    </section>
  </main>;
}
