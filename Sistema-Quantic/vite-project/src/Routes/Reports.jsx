import { useEffect, useRef, useState } from 'react';
import { api } from '../services/http';
import './Reports.css';
import ReportExport from '../Components/ReportExport';

const labels = { totalProductos: 'Productos registrados', productosConStock: 'Con stock', productosSinStock: 'Sin stock', unidadesDisponibles: 'Unidades disponibles' };
const number = new Intl.NumberFormat('es-PE');
const date = value => new Date(value).toLocaleString('es-PE', { timeZone: 'America/Lima' });
function Bars({ rows, labelKey }) {
  const max = Math.max(1, ...rows.map(row => row.unidadesEnStock));
  return <div className="reports-bars">{rows.map(row => <div className="reports-bar-row" key={row[labelKey]}><div><span>{row[labelKey]}</span><strong>{number.format(row.unidadesEnStock)}</strong></div><div className="reports-bar-track" role="img" aria-label={row[labelKey] + ': ' + row.unidadesEnStock + ' unidades'}><span style={{ width: (100 * row.unidadesEnStock / max) + '%' }} /></div><small>{number.format(row.totalProductos)} productos · {number.format(row.productosSinStock)} sin stock</small></div>)}</div>;
}
export default function Reports() {
  const [categoria, setCategoria] = useState('');
  const [mayorista, setMayorista] = useState('');
  const [nombre, setNombre] = useState('Disponibilidad comercial');
  const [seleccionados, setSeleccionados] = useState(Object.keys(labels));
  const [result, setResult] = useState(null);
  const [processes, setProcesses] = useState(null);
  const [processError, setProcessError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const initialized = useRef(false);

  useEffect(() => {
    if (busy || dirty) return;
    const controller = new AbortController();
    let fetching = false;
    async function load() {
      if (fetching) return;
      fetching = true;
      try {
        const [dashboard, jobs] = await Promise.allSettled([
          api('/v1/inventario/dashboards/DASH-01?actual=true', { signal: controller.signal }),
          api('/v1/inventario/procesos', { signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        if (dashboard.status === 'fulfilled') {
          const data = dashboard.value;
          setResult(data); setError('');
          if (!initialized.current) {
            setNombre(data.configuracion.nombre); setSeleccionados(data.configuracion.indicadores);
            setCategoria(data.configuracion.filtros?.categoria || ''); setMayorista(data.configuracion.filtros?.idMayorista || '');
            initialized.current = true;
          }
        } else { setResult(null); setError(dashboard.reason.message); }
        if (jobs.status === 'fulfilled') { setProcesses(jobs.value); setProcessError(''); }
        else { setProcesses(null); setProcessError('No se pudo verificar el estado de las actualizaciones automáticas.'); }
      } finally { fetching = false; if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 30000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [busy, dirty, revision]);

  async function refresh(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const filtros = { ...(categoria ? { categoria } : {}), ...(mayorista ? { idMayorista: mayorista } : {}) };
      const data = await api('/v1/inventario/dashboards/DASH-01', { method: 'PUT', body: { nombre, indicadores: seleccionados, filtros } });
      initialized.current = true; setResult(data); setDirty(false); setNotice('Configuración guardada. El dashboard se actualiza con las nuevas cargas confirmadas.');
    } catch (err) { setError(err.message); setResult(null); } finally { setBusy(false); }
  }
  async function retry(version) {
    setBusy(true); setNotice('');
    try { const response = await api('/v1/inventario/procesos/' + encodeURIComponent(version) + '/reintentar', { method: 'POST' }); setNotice(response.message); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const conStock = result?.indicadores.productosConStock;
  const sinStock = result?.indicadores.productosSinStock;
  const availability = conStock === undefined || sinStock === undefined ? null : { total: conStock + sinStock, percentage: conStock + sinStock ? 100 * conStock / (conStock + sinStock) : 0 };
  return <main className="reports-page">
    <div className="reports-heading"><div><p className="reports-eyebrow">CONTROL DE INVENTARIO</p><h1>Reportes y dashboards</h1><p>Disponibilidad y cantidades publicadas por tus mayoristas.</p></div><span className="reports-live">{dirty ? 'Cambios sin guardar' : 'Consulta automática cada 30 s'}</span></div>
    <form className="reports-controls" onSubmit={refresh}>
      <fieldset disabled={busy || loading}>
        <legend>Configura tu vista</legend>
        <div className="reports-fields"><label>Nombre del dashboard<input className="form-control" value={nombre} onChange={e => { setNombre(e.target.value); setDirty(true); }} maxLength={160} required /></label><label>Categoría<select className="form-select" value={categoria} onChange={e => { setCategoria(e.target.value); setDirty(true); }}><option value="">Todas las categorías</option>{[...new Set([...(result?.catalogo?.categorias || []), ...(categoria ? [categoria] : [])])].map(value => <option key={value}>{value}</option>)}</select></label><label>Mayorista<select className="form-select" value={mayorista} onChange={e => { setMayorista(e.target.value); setDirty(true); }}><option value="">Todos los mayoristas</option>{[...new Set([...(result?.catalogo?.mayoristas || []), ...(mayorista ? [mayorista] : [])])].map(value => <option key={value}>{value}</option>)}</select></label></div>
        <p className="mt-3 mb-2">Indicadores a mostrar</p><div className="reports-options">{Object.entries(labels).map(([key, label]) => <label key={key}><input type="checkbox" checked={seleccionados.includes(key)} onChange={e => { setSeleccionados(values => e.target.checked ? [...values, key] : values.filter(v => v !== key)); setDirty(true); }} /> {label}</label>)}</div>
        <div className="d-flex flex-wrap gap-2 mt-3"><button className="btn btn-primary" disabled={!seleccionados.length} type="submit">{busy ? 'Procesando…' : 'Guardar y actualizar'}</button><button className="btn btn-outline-secondary" type="button" disabled={dirty} onClick={() => setRevision(value => value + 1)}>Consultar ahora</button></div>
        {dirty && <p className="small mt-2 mb-0">Guarda los cambios para aplicar los filtros y reanudar la consulta automática.</p>}
      </fieldset>
    </form>
    {error && <div className="alert alert-danger" role="alert">{error}</div>}{notice && <div className="alert alert-success" role="status">{notice}</div>}
    {!result && !error && <div className="reports-empty" role="status">Consultando inventario confirmado…</div>}
    {result && <section aria-label="Resultados del dashboard">
      <div className="reports-result-heading"><div><h2>{result.nombre}</h2><p>Versión {result.versionInventario} · Datos: {date(result.actualizadoEn)}<br />Consultado: {date(result.generadoEn)} (hora de Perú)</p></div><a className="btn btn-outline-primary" href="#export-title">Preparar descarga</a></div>
      {result.sinRegistros && <p className="alert alert-info mt-3">No hay productos que coincidan con los filtros seleccionados.</p>}
      <div className="reports-kpis">{Object.entries(result.indicadores).map(([key, value]) => <article key={key} className={key === 'productosSinStock' ? 'reports-kpi-warning' : ''}><span>{labels[key]}</span><strong>{number.format(value)}</strong></article>)}</div>
      {!result.sinRegistros && <div className="reports-charts">
        <article className="reports-chart"><h3>Disponibilidad de productos</h3>{availability ? <><div className="reports-donut" role="img" aria-label={conStock + ' productos con stock y ' + sinStock + ' sin stock'} style={{ background: 'conic-gradient(#087f8c 0% ' + availability.percentage + '%, #e89b38 ' + availability.percentage + '% 100%)' }}><div><strong>{availability.percentage.toFixed(1)}%</strong><span>con stock</span></div></div><div className="reports-legend"><span><i />Con stock <strong>{number.format(conStock)}</strong></span><span><i className="reports-orange" />Sin stock <strong>{number.format(sinStock)}</strong></span></div></> : <p>Selecciona «Con stock» y «Sin stock» para ver la distribución de disponibilidad.</p>}</article>
        <article className="reports-chart"><h3>Unidades por categoría</h3><p>Cantidades disponibles, agrupadas por tipo de producto.</p><Bars rows={result.grupos} labelKey="categoria" /></article>
        <article className="reports-chart reports-chart-wide"><h3>Stock por mayorista</h3><p>Existencias publicadas por cada proveedor.</p><Bars rows={result.proveedores || []} labelKey="idMayorista" /></article>
      </div>}
      <div className="reports-table"><h3>Detalle por categoría</h3><table className="table"><caption>Un registro de producto por mayorista. Estos datos reflejan stock disponible, no ventas.</caption><thead><tr><th scope="col">Categoría</th><th scope="col">Productos</th><th scope="col">Con stock</th><th scope="col">Sin stock</th><th scope="col">Unidades</th></tr></thead><tbody>{result.grupos.map(group => <tr key={group.categoria}><th scope="row">{group.categoria}</th><td>{number.format(group.totalProductos)}</td><td>{number.format(group.productosConStock)}</td><td>{number.format(group.productosSinStock)}</td><td>{number.format(group.unidadesEnStock)}</td></tr>)}</tbody></table></div>
      {result.clasificacion && <div className="reports-classification"><h3>Clasificación del inventario</h3><p>{number.format(result.clasificacion.explicita)} con categoría indicada · {number.format(result.clasificacion.seccion)} por sección del Excel · {number.format(result.clasificacion.descripcion)} por descripción · {number.format(result.clasificacion.sinClasificar)} sin clasificar.</p><small>Se respeta la categoría indicada en el archivo. La detección automática usa reglas locales; si no encuentra una coincidencia clara, conserva «Sin categoría».</small></div>}
    </section>}
    <ReportExport catalog={result?.catalogo} />
    <section className="reports-table"><h2>Actualizaciones automáticas</h2><p>Al confirmar una carga se actualizan los dashboards y se registra la auditoría. Los reintentos recuperan las etapas pendientes sin repetir la carga.</p>
      {processError && <p className="alert alert-warning" role="alert">{processError}</p>}
      {processes && <><p>{processes.pendientes ? processes.pendientes + ' procesos con etapas pendientes.' : 'Sin etapas pendientes en los procesos registrados.'}</p>{!processes.procesos.length ? <p className="text-secondary">Las próximas cargas confirmadas aparecerán aquí.</p> : <table className="table"><thead><tr><th>Versión</th><th>Dashboard</th><th>Auditoría</th><th>Estado</th></tr></thead><tbody>{processes.procesos.map(job => <tr key={job.versionInventario}><td>{job.versionInventario}</td><td>{job.dashboard}</td><td>{job.auditoria}</td><td>{job.estado === 'COMPLETO' ? 'Completado' : 'Stock confirmado; etapas pendientes'}{job.requiereReintento && <button className="btn btn-sm btn-outline-primary ms-2" disabled={busy} onClick={() => retry(job.versionInventario)}>Reintentar pendientes</button>}</td></tr>)}</tbody></table>}</>}
    </section>
  </main>;
}
