import { useCallback, useEffect, useState } from 'react';
import { Modal } from 'react-bootstrap';
import { api } from '../services/http';
const configs = {
  sfp: { title: 'Transceptores', subtitle: 'Conectividad óptica y módulos SFP+', all: '/allTransceivers', add: '/addTransceivers', edit: '/editTransceiver', remove: '/deleteTransceiver' },
  device: { title: 'Equipos', subtitle: 'Infraestructura de red y equipos de trabajo', all: '/devices/allDevices', add: '/devices/addDevices', edit: '/devices/editDevice', remove: '/devices/deleteDevice' },
};
const blank = { p_n: '', descripcion: '', marca: '', state: 'New', p_a: 'Almacén', s_n: [] };
function ProductForm({ item, busy, onSave }) {
  const [form, setForm] = useState(item || blank);
  const [serials, setSerials] = useState(item?.s_n?.join('\n') || '');
  const [error, setError] = useState('');
  function submit(event) {
    event.preventDefault();
    const s_n = serials.split('\n').map(value => value.trim()).filter(Boolean);
    if (new Set(s_n).size !== s_n.length) { setError('Hay números de serie repetidos. Cada serie debe ser única.'); return; }
    setError('');
    const body = Object.fromEntries(['p_n', 'descripcion', 'marca', 'state', 'p_a'].map(key => [key, form[key]]));
    onSave({ ...body, s_n, cantidad: s_n.length });
  }
  return <form id="product-form" onSubmit={submit}><fieldset disabled={busy}>{error && <div className="alert alert-danger" role="alert">{error}</div>}<div className="form-grid">{[['p_n', 'Número de parte'], ['marca', 'Marca'], ['descripcion', 'Descripción']].map(([field, label]) => <div className={field === 'descripcion' ? 'full-width' : ''} key={field}><label htmlFor={field}>{label}</label><input className="form-control" id={field} required maxLength={field === 'descripcion' ? 1000 : 160} value={form[field]} onChange={e => setForm({ ...form, [field]: e.target.value })} /></div>)}<div><label htmlFor="state">Estado</label><select id="state" className="form-select" value={form.state} onChange={e => setForm({ ...form, state: e.target.value })}><option value="New">Nuevo</option><option value="Refurbished">Reacondicionado</option></select></div><div><label htmlFor="p_a">Ubicación</label><select id="p_a" className="form-select" value={form.p_a} onChange={e => setForm({ ...form, p_a: e.target.value })}><option>Almacén</option><option>Producción</option></select></div><div className="full-width"><label htmlFor="serials">Números de serie</label><textarea id="serials" className="form-control" rows={5} value={serials} onChange={e => setSerials(e.target.value)} aria-describedby="serial-help" /><p id="serial-help" className="small text-secondary mt-2">Una serie por línea. La cantidad se calcula automáticamente: {serials.split('\n').filter(value => value.trim()).length} unidades.</p></div></div></fieldset></form>;
}
export default function Inventory({ kind }) {
  const config = configs[kind];
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('');
  const [editor, setEditor] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');
  const load = useCallback(async signal => {
    setLoading(true); setError('');
    try { setItems(await api(config.all, { signal })); }
    catch (err) { if (err.name !== 'AbortError') setError(err.message); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [config]);
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort(); }, [load]);
  const brands = [...new Set(items.map(item => item.marca))].sort();
  const filtered = items.filter(item => (!brand || item.marca === brand) && [item.p_n, item.descripcion, item.marca, ...(item.s_n || [])].some(value => value.toLowerCase().includes(query.toLowerCase())));
  async function save(body) {
    setBusy(true); setModalError('');
    try {
      const { data } = await api(editor.item ? `${config.edit}/${editor.item._id}` : config.add, { method: editor.item ? 'PATCH' : 'POST', body });
      setItems(prev => editor.item ? prev.map(item => item._id === data._id ? data : item) : [...prev, data]);
      setEditor(null); setMessage('Producto guardado correctamente.');
    } catch (err) { setModalError(err.message); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setModalError('');
    try { await api(`${config.remove}/${deleting._id}`, { method: 'DELETE' }); setItems(prev => prev.filter(item => item._id !== deleting._id)); setDeleting(null); setMessage('Producto eliminado.'); }
    catch (err) { setModalError(err.message); } finally { setBusy(false); }
  }
  return <main className="workspace"><div className="page-heading"><div><span className="eyebrow">INVENTARIO / {kind === 'sfp' ? 'CONECTIVIDAD' : 'INFRAESTRUCTURA'}</span><h1>{config.title}</h1><p className="text-secondary">{config.subtitle}</p></div><button className="btn btn-primary" onClick={() => { setEditor({ item: null }); setModalError(''); }}>+ Agregar producto</button></div>
    <div className="stats-grid"><div className="stat-card"><span>Productos registrados</span><strong>{loading || error ? '—' : items.length}</strong></div><div className="stat-card"><span>Unidades en inventario</span><strong>{loading || error ? '—' : items.reduce((sum, item) => sum + item.cantidad, 0)}</strong></div><div className="stat-card"><span>Marcas disponibles</span><strong>{loading || error ? '—' : brands.length}</strong></div></div>
    {message && <div className="alert alert-success d-flex justify-content-between" role="status">{message}<button className="btn-close" aria-label="Cerrar aviso" onClick={() => setMessage('')} /></div>}
    <section className="panel inventory-panel"><div className="inventory-toolbar"><div className="search-field"><label htmlFor="search">Buscar en el inventario</label><input id="search" className="form-control" placeholder="Número de parte, descripción o serie…" value={query} onChange={e => setQuery(e.target.value)} /></div><div><label htmlFor="brand">Marca</label><select id="brand" className="form-select" value={brand} onChange={e => setBrand(e.target.value)}><option value="">Todas las marcas</option>{brands.map(value => <option key={value}>{value}</option>)}</select></div><button className="btn btn-outline-secondary" disabled={loading} onClick={() => load()}>Actualizar</button></div>
    {loading ? <div className="empty-state" role="status">Cargando inventario…</div> : error ? <div className="empty-state"><p role="alert">{error}</p><button className="btn btn-primary" onClick={() => load()}>Reintentar</button></div> : filtered.length === 0 ? <div className="empty-state"><span className="empty-icon" aria-hidden="true">▦</span><h2>{items.length ? 'Sin coincidencias' : 'Tu inventario empieza aquí'}</h2><p>{items.length ? 'Prueba con otra búsqueda o selecciona todas las marcas.' : 'Agrega el primer producto para registrar sus unidades y números de serie.'}</p>{items.length > 0 && <button className="btn btn-outline-primary" onClick={() => { setQuery(''); setBrand(''); }}>Limpiar filtros</button>}</div> : <><div className="table-responsive"><table className="table align-middle inventory-table"><caption className="visually-hidden">Inventario de {config.title.toLowerCase()}</caption><thead><tr><th>Producto</th><th>Marca</th><th>Estado</th><th>Ubicación</th><th>Series</th><th className="text-end">Unidades</th><th className="text-end">Acciones</th></tr></thead><tbody>{filtered.map(item => <tr key={item._id}><td><strong>{item.p_n}</strong><span className="product-description">{item.descripcion}</span></td><td>{item.marca}</td><td><span className={`status-pill ${item.state === 'New' ? 'status-new' : ''}`}>{item.state === 'New' ? 'Nuevo' : 'Reacondicionado'}</span></td><td>{item.p_a}</td><td>{item.s_n?.length ? <details><summary>{item.s_n.length} series</summary><ul className="serial-list">{item.s_n.map((value, index) => <li key={`${index}-${value}`}>{value}</li>)}</ul></details> : 'Sin series'}</td><td className="text-end quantity">{item.cantidad}</td><td><div className="table-actions"><button className="btn btn-sm btn-outline-secondary" aria-label={`Editar ${item.p_n}`} onClick={() => { setEditor({ item }); setModalError(''); }}>Editar</button><button className="btn btn-sm btn-outline-danger" aria-label={`Eliminar ${item.p_n}`} onClick={() => { setDeleting(item); setModalError(''); }}>Eliminar</button></div></td></tr>)}</tbody></table></div><div className="table-summary">Mostrando {filtered.length} de {items.length} productos</div></>}
    </section>
    <Modal show={Boolean(editor)} onHide={() => !busy && setEditor(null)} backdrop="static" size="lg" centered><Modal.Header closeButton={!busy} closeLabel="Cerrar"><Modal.Title>{editor?.item ? 'Editar producto' : 'Agregar producto'}</Modal.Title></Modal.Header><Modal.Body>{modalError && <div className="alert alert-danger" role="alert">{modalError}</div>}{editor && <ProductForm item={editor.item} onSave={save} busy={busy} />}</Modal.Body><Modal.Footer><button className="btn btn-outline-secondary" disabled={busy} onClick={() => setEditor(null)}>Cancelar</button><button className="btn btn-primary" type="submit" form="product-form" disabled={busy}>{busy ? 'Guardando…' : 'Guardar producto'}</button></Modal.Footer></Modal>
    <Modal show={Boolean(deleting)} onHide={() => !busy && setDeleting(null)} centered><Modal.Header closeButton={!busy} closeLabel="Cerrar"><Modal.Title>Eliminar producto</Modal.Title></Modal.Header><Modal.Body>{modalError && <div className="alert alert-danger" role="alert">{modalError}</div>}Se eliminará <strong>{deleting?.p_n}</strong> y sus números de serie del inventario. Esta acción no se puede deshacer.</Modal.Body><Modal.Footer><button className="btn btn-outline-secondary" disabled={busy} onClick={() => setDeleting(null)}>Cancelar</button><button className="btn btn-danger" disabled={busy} onClick={remove}>{busy ? 'Eliminando…' : 'Eliminar producto'}</button></Modal.Footer></Modal>
  </main>;
}
