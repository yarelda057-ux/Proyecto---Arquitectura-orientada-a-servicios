import StockHistory from '../Components/StockHistory';
import { useContext, useEffect, useState } from 'react';
import { SfpContext } from '../context/authContext';
import { api } from '../services/http';

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(file);
  });
}

export default function SupplierUpload() {
  const { user } = useContext(SfpContext);
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState(user.idMayorista || '');
  const [file, setFile] = useState(null);
  const [batch, setBatch] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    api('/v1/stock/proveedores', { signal: controller.signal }).then(({ proveedores }) => {
      setSuppliers(proveedores);
      if (!supplierId && proveedores.length === 1) setSupplierId(proveedores[0].idMayorista);
    }).catch(err => { if (err.name !== 'AbortError') setError(err.message); });
    return () => controller.abort();
  }, [supplierId]);

  async function upload(event) {
    event.preventDefault();
    setError(''); setMessage(''); setBatch(null);
    if (!supplierId || !file) { setError('Selecciona el proveedor y un archivo XLSX.'); return; }
    if (!/\.xlsx$/i.test(file.name) || file.size > 10 * 1024 * 1024) { setError('El archivo debe ser XLSX y no superar 10 MB.'); return; }
    setBusy(true);
    try {
      const archivoBase64 = await readBase64(file);
      const idempotencyKey = crypto.randomUUID();
      const accepted = await api('/v1/stock/upload', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: { idMayorista: supplierId, archivoBase64, formato: 'XLSX', nombreArchivo: file.name } });
      const validation = await api(`/v1/stock/upload/${encodeURIComponent(accepted.idLote)}/validate`);
      setBatch({ ...validation, idLote: accepted.idLote, confirmationKey: `confirm-${idempotencyKey}` });
      setMessage(validation.esValido ? 'Archivo validado. Confirma el lote para publicar sus existencias.' : 'El archivo tiene observaciones y no se publicará.');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function confirm() {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api(`/v1/stock/lotes/${encodeURIComponent(batch.idLote)}/confirmacion`, { method: 'POST', headers: { 'Idempotency-Key': batch.confirmationKey }, body: { idOperacion: crypto.randomUUID() } });
      setBatch(current => ({ ...current, ...result, esValido: true }));
      setMessage(`Lote confirmado: ${result.productosActualizados} productos publicados (${result.versionInventario}).`);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <main className="workspace"><div className="page-heading"><div><span className="eyebrow">MAYORISTAS / CARGA DE STOCK</span><h1>Publicar inventario desde Excel</h1><p className="text-secondary">Usa la plantilla con PartNumber, Descripción, QTY y Precio US$. Las filas de título de categoría se ignoran.</p></div></div>
    <section className="panel upload-panel"><form onSubmit={upload}><fieldset disabled={busy}><div className="form-grid"><div><label htmlFor="upload-supplier">Mayorista</label><select id="upload-supplier" className="form-select" value={supplierId} disabled={user.role === 'mayorista'} onChange={event => setSupplierId(event.target.value)} required><option value="">Selecciona un proveedor</option>{suppliers.map(supplier => <option key={supplier.idMayorista} value={supplier.idMayorista}>{supplier.nombre} · {supplier.idMayorista}</option>)}</select></div><div><label htmlFor="stock-file">Archivo de stock</label><input id="stock-file" className="form-control" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => setFile(event.target.files?.[0] || null)} required /></div></div><p className="small text-secondary mt-3 mb-0">Máximo 10 MB y 10 000 filas. No se permiten macros ni fórmulas; la carga no reemplaza el inventario hasta que confirmes el lote.</p><button className="btn btn-primary mt-4" type="submit">{busy ? 'Validando…' : 'Validar archivo'}</button></fieldset></form></section>
    {error && <div className="alert alert-danger mt-4" role="alert">{error}</div>}{message && <div className={`alert ${batch?.esValido ? 'alert-success' : 'alert-warning'} mt-4`} role="status">{message}</div>}
    {batch && <section className="panel batch-panel"><div><span className="eyebrow">LOTE {batch.idLote}</span><h2>{batch.estado}</h2><p className="mb-1">Filas válidas: <strong>{batch.filasCorrectas}</strong> · Filas con error: <strong>{batch.filasErroneas}</strong></p>{batch.versionInventario && <p className="mb-0">Versión publicada: <strong>{batch.versionInventario}</strong></p>}</div>{batch.esValido && batch.estado !== 'PROCESADO' && <button className="btn btn-primary" disabled={busy} onClick={confirm}>{busy ? 'Confirmando…' : 'Confirmar y publicar stock'}</button>}</section>}
    {batch?.errores?.length > 0 && <section className="panel mt-3"><h2>Observaciones del archivo</h2><div className="table-responsive"><table className="table mb-0"><thead><tr><th>Fila</th><th>Campo</th><th>Motivo</th></tr></thead><tbody>{batch.errores.map((item, index) => <tr key={`${item.fila}-${item.campo}-${index}`}><td>{item.fila}</td><td>{item.campo}</td><td>{item.motivo}</td></tr>)}</tbody></table></div></section>}
    <StockHistory key={batch?.estado + (batch?.idLote || "")} supplierId={supplierId} initialBatch={batch?.idLote} />
  </main>;
}
