import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/http';

const blank = { nombre: '', ruc: '', correoContacto: '', periodoActualizacionDias: '30', crearAcceso: false, password: '' };

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [access, setAccess] = useState(null);
  async function createAccess(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      await api('/v1/stock/proveedores/' + encodeURIComponent(access.idMayorista) + '/usuarios' + (access.userId ? '/' + encodeURIComponent(access.userId) + '/password' : ''), { method: access.userId ? 'PUT' : 'POST', body: access.userId ? { password: access.password } : { email: access.email, password: access.password } });
      await load();
      setMessage((access.userId ? 'Contraseña actualizada. Las sesiones anteriores se cerraron. Ingresa con ' : 'Acceso creado. Ingresa con ') + access.email + ' y la contraseña asignada.');
      setAccess(null);
    } catch (err) { setError(err.status === 409 ? 'El correo o el mayorista ya tiene una cuenta. Actualiza la lista para modificar su contraseña.' : err.message); }
    finally { setBusy(false); }
  }
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const data = await api('/v1/stock/proveedores'); setSuppliers(data.proveedores); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const { proveedor } = await api('/v1/stock/proveedores', { method: 'POST', body: { nombre: form.nombre, ruc: form.ruc, correoContacto: form.correoContacto, periodoActualizacionDias: Number(form.periodoActualizacionDias) } });
      setSuppliers(current => [...current, proveedor].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      if (form.crearAcceso) await api(`/v1/stock/proveedores/${encodeURIComponent(proveedor.idMayorista)}/usuarios`, { method: 'POST', body: { email: proveedor.correoContacto, password: form.password } });
      await load();
      setForm(blank);
      setMessage(form.crearAcceso ? `Proveedor y acceso de mayorista registrados con ID ${proveedor.idMayorista}.` : `Proveedor registrado con ID ${proveedor.idMayorista}.`);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <main className="workspace"><div className="page-heading"><div><span className="eyebrow">ADMINISTRACIÓN / PROVEEDORES</span><h1>Registro de proveedores</h1><p className="text-secondary">Cada proveedor recibe un identificador único que lo vincula con sus cargas de stock.</p></div></div>
    <section className="panel"><h2>Registrar proveedor</h2><form onSubmit={submit}><fieldset disabled={busy}><div className="form-grid"><div><label htmlFor="supplier-name">Nombre o razón social</label><input id="supplier-name" className="form-control" required maxLength="160" value={form.nombre} onChange={event => setForm({ ...form, nombre: event.target.value })} /></div><div><label htmlFor="supplier-ruc">RUC (opcional)</label><input id="supplier-ruc" className="form-control" inputMode="numeric" pattern="\d{11}" value={form.ruc} onChange={event => setForm({ ...form, ruc: event.target.value })} /></div><div><label htmlFor="supplier-email">Correo de contacto</label><input id="supplier-email" className="form-control" type="email" required value={form.correoContacto} onChange={event => setForm({ ...form, correoContacto: event.target.value })} /></div><div><label htmlFor="supplier-period">Periodo de actualización (días)</label><input id="supplier-period" className="form-control" type="number" min="1" max="365" required value={form.periodoActualizacionDias} onChange={event => setForm({ ...form, periodoActualizacionDias: event.target.value })} /></div><div className="full-width"><label className="access-check"><input type="checkbox" checked={form.crearAcceso} onChange={event => setForm({ ...form, crearAcceso: event.target.checked })} /> Crear acceso para que este mayorista publique su propio stock</label>{form.crearAcceso && <><label className="mt-3" htmlFor="supplier-password">Contraseña inicial</label><input id="supplier-password" className="form-control" type="password" minLength="15" maxLength="72" required value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /><p className="small text-secondary mt-2 mb-0">El mayorista ingresará con el correo de contacto y esta contraseña.</p></>}</div></div><button className="btn btn-primary mt-4" type="submit">{busy ? 'Registrando…' : 'Registrar proveedor'}</button></fieldset></form></section>
    {error && <div className="alert alert-danger mt-4" role="alert">{error}</div>}{message && <div className="alert alert-success mt-4" role="status">{message}</div>}
    <section className="panel mt-4"><div className="d-flex align-items-center justify-content-between gap-3"><h2 className="mb-0">Proveedores registrados</h2><button className="btn btn-outline-secondary btn-sm" disabled={loading} onClick={load}>Actualizar</button></div>{loading ? <div className="empty-state" role="status">Cargando proveedores…</div> : suppliers.length === 0 ? <div className="empty-state">Aún no se registraron proveedores.</div> : <div className="table-responsive mt-3"><table className="table align-middle mb-0"><thead><tr><th>ID</th><th>Proveedor</th><th>Contacto</th><th>Periodo</th><th>Estado</th><th>Acceso</th></tr></thead><tbody>{suppliers.map(supplier => <tr key={supplier.idMayorista}><td><strong>{supplier.idMayorista}</strong></td><td>{supplier.nombre}{supplier.ruc && <span className="product-description">RUC: {supplier.ruc}</span>}</td><td>{supplier.correoContacto}</td><td>{supplier.periodoActualizacionDias} días</td><td><span className={`status-pill ${supplier.activo ? 'status-new' : ''}`}>{supplier.activo ? 'Activo' : 'Inactivo'}</span></td><td>{supplier.accesos?.length ? supplier.accesos.map(account => <div key={account.id}><span className="product-description">{account.email}</span><button type="button" className="btn btn-outline-primary btn-sm" disabled={busy || !supplier.activo} onClick={() => { setAccess({ idMayorista: supplier.idMayorista, nombre: supplier.nombre, email: account.email, userId: account.id, password: '' }); setError(''); setMessage(''); }}>Modificar contraseña</button></div>) : <button type="button" className="btn btn-outline-primary btn-sm" disabled={busy || !supplier.activo} onClick={() => { setAccess({ idMayorista: supplier.idMayorista, nombre: supplier.nombre, email: supplier.correoContacto, password: '' }); setError(''); setMessage(''); }}>Crear acceso</button>}</td></tr>)}</tbody></table></div>}</section>
    {access && <section className="panel mt-4" aria-labelledby="access-title"><h2 id="access-title">{access.userId ? 'Modificar contraseña de' : 'Crear acceso para'} {access.nombre}</h2><p>Entrega al mayorista este correo y la contraseña que asignes. Ingresará desde el login habitual.</p><form onSubmit={createAccess}><fieldset disabled={busy}><div className="form-grid"><div><label htmlFor="access-email">Correo para iniciar sesión</label><input id="access-email" className="form-control" type="email" autoComplete="off" readOnly={Boolean(access.userId)} required value={access.email} onChange={event => setAccess({ ...access, email: event.target.value })} /></div><div><label htmlFor="access-password">Nueva contraseña (mínimo 15 caracteres)</label><input id="access-password" className="form-control" type="password" autoComplete="new-password" minLength={15} maxLength={72} required value={access.password} onChange={event => setAccess({ ...access, password: event.target.value })} /></div></div><div className="d-flex gap-3 mt-3"><button className="btn btn-primary" type="submit">{busy ? 'Guardando…' : access.userId ? 'Guardar contraseña' : 'Guardar acceso'}</button><button className="btn btn-outline-secondary" type="button" onClick={() => setAccess(null)}>Cancelar</button></div></fieldset></form></section>}
  </main>;
}
