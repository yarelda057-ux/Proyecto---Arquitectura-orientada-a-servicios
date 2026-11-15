import Modal from 'react-bootstrap/Modal';
import { useEffect, useState } from 'react';
import { api } from '../services/http';
export default function StockHistory({ supplierId }) {
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState({ items: [], total: 0 });
  const [selected, setSelected] = useState('');
  const [previewPage, setPreviewPage] = useState(1);
  const [preview, setPreview] = useState({ items: [], total: 0 });
  const [error, setError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    const query = new URLSearchParams({ page, pageSize: 20, ...(supplierId ? { idMayorista: supplierId } : {}), ...(date ? { fecha: date } : {}) });
    api('/v1/stock/historial?' + query, { signal: controller.signal }).then(setHistory).catch(err => { if (err.name !== 'AbortError') setError(err.message); });
    return () => controller.abort();
  }, [supplierId, date, page, revision]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setPreviewLoading(true); setPreviewError('');
    setPreview({ items: [], total: 0 });
    api('/v1/stock/lotes/' + encodeURIComponent(selected) + '/preview?page=' + previewPage + '&pageSize=50', { signal: controller.signal }).then(setPreview).catch(err => { if (err.name !== 'AbortError') setPreviewError(err.message); }).finally(() => { if (!controller.signal.aborted) setPreviewLoading(false); });
    return () => controller.abort();
  }, [selected, previewPage]);
  async function download(batchId, original = false) {
    setBusy(true); setError('');
    try {
      const data = await api('/v1/stock/lotes/' + encodeURIComponent(batchId) + '/excel' + (original ? '' : '?formato=presentacion'));
      const bytes = Uint8Array.from(atob(data.archivoBase64), char => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a'); link.href = url; link.download = data.nombreArchivo.replace(/[\\/]/g, '_'); link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <section className="panel mt-4">
    <h2>Historial de archivos Excel</h2>
    <p>Cada carga conserva sus productos y precios de ese momento. El inventario principal muestra la última actualización publicada de cada producto.</p>
    <label htmlFor="history-date">Fecha de carga (hora de Perú)</label>
    <div className="d-flex gap-2 mb-3"><input id="history-date" className="form-control" type="date" value={date} onChange={event => { setDate(event.target.value); setPage(1); setSelected(''); }} /><button className="btn btn-outline-secondary" onClick={() => { setDate(''); setPage(1); setSelected(''); }}>Todas las fechas</button><button className="btn btn-outline-secondary" onClick={() => setRevision(value => value + 1)}>Actualizar</button></div>
    {error && <p className="alert alert-danger" role="alert">{error}</p>}
    <div className="table-responsive"><table className="table"><thead><tr><th>Fecha</th><th>Proveedor</th><th>Archivo</th><th>Estado</th><th>Productos</th><th>Acciones</th></tr></thead><tbody>{history.items.map(batch => <tr key={batch.batchId}><td>{new Date(batch.createdAt).toLocaleString('es-PE', { timeZone: 'America/Lima' })}</td><td>{batch.supplierId}</td><td>{batch.nombreArchivo || batch.batchId}</td><td>{batch.estado}</td><td>{batch.filasCorrectas}</td><td><button className="btn btn-outline-primary btn-sm me-2" onClick={() => { setSelected(batch.batchId); setPreviewPage(1); }}>Vista previa</button><button className="btn btn-outline-secondary btn-sm" disabled={busy} onClick={() => download(batch.batchId)}>Excel con formato</button></td></tr>)}</tbody></table></div>
    {!history.items.length && <p>No hay archivos para esta fecha y proveedor.</p>}
    <div className="d-flex gap-2"><button disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page}</span><button disabled={page * 20 >= history.total} onClick={() => setPage(page + 1)}>Siguiente</button></div>
    <Modal show={Boolean(selected)} onHide={() => setSelected('')} size="xl" centered scrollable className="stock-preview" aria-labelledby="stock-preview-title">
      <Modal.Header closeButton closeLabel="Cerrar vista previa">
        <div className="stock-preview-heading"><span className="sheet-file-icon" aria-hidden="true">X</span><div><span className="eyebrow">VISTA PREVIA DEL ARCHIVO</span><Modal.Title id="stock-preview-title">{history.items.find(item => item.batchId === selected)?.nombreArchivo || 'Stock del mayorista'}</Modal.Title><p>{selected}</p></div></div>
      </Modal.Header>
      <Modal.Body>
        <div className="sheet-toolbar"><div><span className="sheet-status">Solo lectura</span><span>{preview.total.toLocaleString('es-PE')} productos</span><span>{preview.estado || 'Consultando…'}</span></div><button className="btn btn-primary btn-sm" disabled={busy || previewLoading || Boolean(previewError)} onClick={() => download(selected)}>{busy ? 'Preparando…' : '↓ Descargar Excel con formato'}</button></div>
        {error && <p className="alert alert-danger m-3" role="alert">{error}</p>}
        {previewLoading ? <div className="empty-state" role="status">Preparando hoja de cálculo…</div> : previewError ? <p className="alert alert-danger m-3" role="alert">{previewError}</p> : <div className="sheet-canvas" tabIndex={0} aria-label="Hoja de productos, desplazable">
          <table className="sheet-grid"><caption className="visually-hidden">Productos y precios de esta carga</caption><colgroup><col className="sheet-row-number" /><col className="sheet-code" /><col className="sheet-description" /><col className="sheet-quantity" /><col className="sheet-price" /><col className="sheet-category" /></colgroup>
            <thead><tr className="sheet-letters"><th aria-label="Número de fila"></th><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th></tr><tr className="sheet-column-titles"><th>1</th><th scope="col">PartNumber</th><th scope="col">Descripción</th><th scope="col">QTY</th><th scope="col">Precio US$</th><th scope="col">Categoría</th></tr></thead>
            <tbody>{preview.items.map((row, index) => <tr key={index}><th scope="row">{(previewPage - 1) * 50 + index + 2}</th><td className="sheet-part">{row.partNumber}</td><td>{row.descripcion}</td><td className="sheet-numeric">{row.cantidad.toLocaleString('es-PE')}</td><td className="sheet-numeric">{row.precioUsd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td><td title={row.categoriaOrigen || ''}>{row.categoria || 'Sin categoría'}</td></tr>)}</tbody>
          </table>
          {!preview.items.length && <p className="empty-state">Esta carga no contiene productos válidos para mostrar.</p>}
        </div>}
        {!!preview.errores?.length && <p className="alert alert-warning m-3">La carga tiene observaciones. Revisa los errores antes de publicarla.</p>}
        <div className="sheet-tabs"><span>▦ Stock</span><small>Los precios corresponden a la fecha de esta carga.</small></div>
      </Modal.Body>
      <Modal.Footer>
        <button className="btn btn-link btn-sm me-auto" disabled={busy} onClick={() => download(selected, true)}>Descargar archivo original*</button>
        <div className="sheet-pagination"><button className="btn btn-outline-secondary btn-sm" disabled={previewLoading || previewPage === 1} onClick={() => setPreviewPage(previewPage - 1)}>Anterior</button><span>{previewPage} / {Math.max(1, Math.ceil(preview.total / 50))}</span><button className="btn btn-outline-secondary btn-sm" disabled={previewLoading || previewPage * 50 >= preview.total} onClick={() => setPreviewPage(previewPage + 1)}>Siguiente</button></div>
        <small className="sheet-download-note">* Para cargas antiguas sin original guardado, se genera un Excel con los datos disponibles.</small>
      </Modal.Footer>
    </Modal>
  </section>;
}
