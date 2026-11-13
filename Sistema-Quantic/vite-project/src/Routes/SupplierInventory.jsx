import StockHistory from '../Components/StockHistory';
import { useCallback, useContext, useEffect, useState } from 'react';
import { SfpContext } from '../context/authContext';
import { api } from '../services/http';

function queryString(values) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value) params.set(key, value); });
  return params.toString();
}

export default function SupplierInventory() {
  const { user } = useContext(SfpContext);
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState(user.idMayorista || '');
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    api('/v1/stock/proveedores', { signal: controller.signal })
      .then(({ proveedores }) => {
        setSuppliers(proveedores);
        if (!supplierId && proveedores.length === 1) setSupplierId(proveedores[0].idMayorista);
      })
      .catch(err => { if (err.name !== 'AbortError') setError(err.message); });
    return () => controller.abort();
  }, [supplierId]);

  const load = useCallback(async signal => {
    setLoading(true); setError('');
    try {
      const qs = queryString({ idMayorista: supplierId, nombre: query.trim(), pageSize: '100' });
      const data = await api(`/v1/stock/products${qs ? `?${qs}` : ''}`, { signal });
      setProducts(data.productos); setTotal(data.total);
    } catch (err) { if (err.name !== 'AbortError') setError(err.message); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [supplierId, query]);

  useEffect(() => {
    const controller = new AbortController();
    const debounce = setTimeout(() => load(controller.signal), 150);
    return () => { clearTimeout(debounce); controller.abort(); };
  }, [load]);

  const units = products.reduce((sum, product) => sum + product.cantidad, 0);
  const sourceLabel = user.role === 'mayorista' ? 'MI STOCK PUBLICADO' : 'INVENTARIO / PROVEEDORES';
  return <main className="workspace">
    <div className="page-heading"><div><span className="eyebrow">{sourceLabel}</span><h1>Inventario de proveedores</h1><p className="text-secondary">Consulta equipos, cantidades y precios publicados por cada mayorista.</p></div><button className="btn btn-outline-secondary" disabled={loading} onClick={() => load()}>Actualizar</button></div>
    <div className="stats-grid"><div className="stat-card"><span>Productos visibles</span><strong>{loading ? '—' : total}</strong></div><div className="stat-card"><span>Unidades visibles</span><strong>{loading ? '—' : units}</strong></div><div className="stat-card"><span>Proveedor seleccionado</span><strong className="stat-text">{supplierId || 'Todos'}</strong></div></div>
    <section className="panel inventory-panel">
      <div className="inventory-toolbar"><div className="search-field"><label htmlFor="supplier-search">Buscar por número de parte o descripción</label><input id="supplier-search" className="form-control" placeholder="FG-40F, firewall, FortiGate…" value={query} onChange={event => setQuery(event.target.value)} /></div><div><label htmlFor="supplier-filter">Mayorista</label><select id="supplier-filter" className="form-select" value={supplierId} disabled={user.role === 'mayorista'} onChange={event => setSupplierId(event.target.value)}><option value="">Todos los proveedores</option>{suppliers.map(supplier => <option key={supplier.idMayorista} value={supplier.idMayorista}>{supplier.nombre}</option>)}</select></div></div>
      {loading ? <div className="empty-state" role="status">Cargando inventario de proveedores…</div> : error ? <div className="empty-state"><p role="alert">{error}</p><button className="btn btn-primary" onClick={() => load()}>Reintentar</button></div> : products.length === 0 ? <div className="empty-state"><span className="empty-icon" aria-hidden="true">▦</span><h2>Sin productos publicados</h2><p>{query ? 'Prueba con otra búsqueda.' : 'Aún no hay existencias confirmadas para este proveedor.'}</p></div> : <><div className="table-responsive"><table className="table align-middle inventory-table supplier-table"><caption className="visually-hidden">Inventario de proveedores</caption><thead><tr><th>Proveedor</th><th>Part Number</th><th>Descripción</th><th>Categoría</th><th className="text-end">Cantidad</th><th className="text-end">Precio USD</th><th>Actualizado</th></tr></thead><tbody>{products.map(product => <tr key={product.idProducto}><td><strong>{product.nombreMayorista || product.idMayorista}</strong><span className="product-description">{product.idMayorista}</span></td><td><strong>{product.partNumber}</strong></td><td>{product.descripcion}</td><td>{product.categoria}</td><td className="text-end quantity">{product.cantidad}</td><td className="text-end">{product.precioUsd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td><td>{new Date(product.actualizadoEn).toLocaleString('es-PE')}</td></tr>)}</tbody></table></div><div className="table-summary">Mostrando {products.length} de {total} productos</div></>}
    </section>
    <StockHistory key={supplierId} supplierId={supplierId} />
  </main>;
}
