import { useEffect, useState } from 'react';
import Modal from 'react-bootstrap/Modal';
import { api } from '../services/http';

const blank = { q: '', categoria: '', ciudad: '', tipo_servicio: '' };
const categories = ['Soporte técnico', 'Redes e infraestructura', 'Ciberseguridad', 'Consultoría tecnológica'];
function website(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
function Contact({ company }) {
  const url = website(company?.sitio_web);
  return <dl className="row mb-0"><dt className="col-sm-4">Empresa</dt><dd className="col-sm-8">{company?.razon_social || '—'}</dd><dt className="col-sm-4">RUC</dt><dd className="col-sm-8">{company?.ruc || '—'}</dd><dt className="col-sm-4">Ciudad</dt><dd className="col-sm-8">{company?.ciudad || '—'}</dd><dt className="col-sm-4">Dirección</dt><dd className="col-sm-8">{company?.direccion || '—'}</dd><dt className="col-sm-4">Teléfono</dt><dd className="col-sm-8">{company?.telefono || '—'}</dd><dt className="col-sm-4">Correo</dt><dd className="col-sm-8 text-break">{company?.email_contacto || '—'}</dd>{url && <><dt className="col-sm-4">Sitio web</dt><dd className="col-sm-8 text-break"><a href={url} target="_blank" rel="noopener noreferrer">Visitar sitio web</a></dd></>}</dl>;
}
export default function AdditionalServices() {
  const [kind, setKind] = useState('servicios');
  const [filters, setFilters] = useState(blank);
  const [search, setSearch] = useState('');
  const [reload, setReload] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setItems([]);
    api('/additional-services/' + kind + search, { signal: controller.signal })
      .then(data => setItems(data.datos))
      .catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [kind, search, reload]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setDetail(null); setDetailError(''); setDetailLoading(true);
    api('/additional-services/' + selected.kind + '/' + selected.id, { signal: controller.signal })
      .then(data => setDetail(data.datos))
      .catch(err => { if (!controller.signal.aborted) setDetailError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [selected]);
  function submit(event) {
    event.preventDefault();
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value.trim() && (kind === 'servicios' || ['q', 'ciudad'].includes(key))) query.set(key, value.trim());
    setSearch(query.size ? '?' + query : ''); setReload(value => value + 1);
  }
  function changeKind(next) { setKind(next); setFilters(blank); setSearch(''); setSelected(null); }
  return <main className="workspace">
    <div className="page-heading"><div><span className="eyebrow">DIRECTORIO COMERCIAL</span><h1>Servicios adicionales</h1><p className="text-secondary">Encuentra empresas de soporte, redes, ciberseguridad y consultoría tecnológica.</p></div><button className="btn btn-outline-secondary" disabled={loading} onClick={() => setReload(value => value + 1)}>Actualizar</button></div>
    <section className="panel mb-4">
      <div className="btn-group mb-4" role="group" aria-label="Tipo de consulta">{['servicios', 'empresas'].map(value => <button key={value} className={'btn ' + (kind === value ? 'btn-primary' : 'btn-outline-primary')} aria-pressed={kind === value} onClick={() => changeKind(value)}>{value === 'servicios' ? 'Servicios' : 'Empresas'}</button>)}</div>
      <form onSubmit={submit} className="row g-3 align-items-end">
        <div className="col-md-6"><label htmlFor="additional-q" className="form-label">Buscar</label><input id="additional-q" className="form-control" maxLength={160} placeholder="Nombre, empresa o descripción" value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value })} /></div>
        <div className="col-md-6"><label htmlFor="additional-city" className="form-label">Ciudad</label><input id="additional-city" className="form-control" maxLength={80} placeholder="Por ejemplo, Lima" value={filters.ciudad} onChange={e => setFilters({ ...filters, ciudad: e.target.value })} /></div>
        {kind === 'servicios' && <><div className="col-md-6"><label htmlFor="additional-category" className="form-label">Categoría</label><select id="additional-category" className="form-select" value={filters.categoria} onChange={e => setFilters({ ...filters, categoria: e.target.value })}><option value="">Todas las categorías</option>{categories.map(value => <option key={value}>{value}</option>)}</select></div><div className="col-md-6"><label htmlFor="additional-mode" className="form-label">Modalidad</label><select id="additional-mode" className="form-select" value={filters.tipo_servicio} onChange={e => setFilters({ ...filters, tipo_servicio: e.target.value })}><option value="">Todas las modalidades</option>{['Presencial', 'Remoto', 'Híbrido'].map(value => <option key={value}>{value}</option>)}</select></div></>}
        <div className="col-12 d-flex gap-2"><button className="btn btn-primary" disabled={loading}>Buscar</button><button type="button" className="btn btn-outline-secondary" onClick={() => { setFilters(blank); setSearch(''); setReload(value => value + 1); }}>Limpiar filtros</button></div>
      </form>
    </section>
    {loading ? <div className="empty-state" role="status">Consultando el catálogo…</div> : error ? <div className="alert alert-warning" role="alert"><p>{error}</p><button className="btn btn-outline-dark btn-sm" onClick={() => setReload(value => value + 1)}>Reintentar</button></div> : <>
      <p role="status" className="text-secondary">{items.length} {kind === 'servicios' ? 'servicios encontrados' : 'empresas encontradas'}</p>
      {!items.length ? <div className="empty-state">No hay resultados publicados para estos filtros.</div> : <div className="row g-3">{items.map(item => <div className="col-md-6 col-xl-4" key={item.id}><article className="panel h-100 d-flex flex-column"><span className="eyebrow">{kind === 'servicios' ? item.categoria : item.ciudad}</span><h2 className="mt-2">{item.nombre || item.razon_social}</h2>{kind === 'servicios' && <p className="text-secondary">{item.empresa_razon_social} · {item.empresa_ciudad}</p>}<p>{item.descripcion}</p>{kind === 'servicios' && <p><strong>{item.precio_referencial || 'A cotizar'}</strong><br /><small>{item.tipo_servicio}</small></p>}<button className="btn btn-outline-primary mt-auto align-self-start" onClick={() => setSelected({ kind, id: item.id })}>Ver detalles y contacto</button></article></div>)}</div>}
    </>}
    <p className="text-secondary small mt-4">Los precios son referenciales. Contacta directamente a la empresa para consultar disponibilidad y condiciones.</p>
    <Modal show={Boolean(selected)} onHide={() => setSelected(null)} size="lg" centered aria-labelledby="additional-detail-title">
      <Modal.Header closeButton><Modal.Title id="additional-detail-title">{detail?.nombre || detail?.razon_social || 'Detalles del catálogo'}</Modal.Title></Modal.Header>
      <Modal.Body>{detailLoading ? <p role="status">Cargando detalles…</p> : detailError ? <div role="alert"><p>{detailError}</p><button className="btn btn-outline-primary" onClick={() => setSelected({ ...selected })}>Reintentar</button></div> : detail && <><p>{detail.descripcion}</p>{selected?.kind === 'servicios' && <p><strong>{detail.precio_referencial || 'A cotizar'}</strong> · {detail.tipo_servicio}</p>}<Contact company={selected?.kind === 'servicios' ? detail.empresa : detail} />{selected?.kind === 'empresas' && <><h3 className="h5 mt-4">Servicios publicados</h3>{detail.servicios?.length ? <ul>{detail.servicios.map(service => <li key={service.id}><button className="btn btn-link text-start" onClick={() => setSelected({ kind: 'servicios', id: service.id })}>{service.nombre}</button></li>)}</ul> : <p>No tiene servicios publicados.</p>}</>}</>}</Modal.Body>
      <Modal.Footer><button className="btn btn-secondary" onClick={() => setSelected(null)}>Cerrar</button></Modal.Footer>
    </Modal>
  </main>;
}
