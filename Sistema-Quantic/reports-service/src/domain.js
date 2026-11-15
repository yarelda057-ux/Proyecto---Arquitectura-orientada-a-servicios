export const indicators = ['totalProductos', 'productosConStock', 'productosSinStock', 'unidadesDisponibles'];
export const fail = (status, message) => Object.assign(new Error(message), { status });
export function object(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw fail(400, 'Campos no admitidos o estructura inválida.');
}
export function text(value, max = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw fail(400, 'Texto inválido.');
  return value.trim();
}
export function filters(value = {}) {
  object(value, ['categoria', 'idMayorista']);
  return Object.fromEntries(Object.entries(value).map(([key, value]) => [key, text(value)]));
}
export function version(value) { return text(value, 100); }
export function validateSnapshot(data, expected) {
  if (!data || typeof data.versionInventario !== 'string' || !data.versionInventario.trim() || data.versionInventario.length > 100 || !Array.isArray(data.productos) || data.total !== data.productos.length || data.productos.length > 100000 || typeof data.actualizadoEn !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(data.actualizadoEn) || !Number.isFinite(Date.parse(data.actualizadoEn))) throw fail(503, 'La fuente no entregó una versión completa y fechada.');
  if (expected && expected !== data.versionInventario) throw fail(409, 'La versión solicitada ya no está disponible. Actualiza los datos.');
  const seen = new Set();
  const productos = data.productos.map(p => {
    if (!p || typeof p.idProducto !== 'string' || !p.idProducto || seen.has(p.idProducto) || typeof p.categoria !== 'string' || !p.categoria || typeof p.idMayorista !== 'string' || !p.idMayorista || !Number.isSafeInteger(p.stock) || p.stock < 0) throw fail(503, 'La fuente contiene productos inválidos o duplicados.');
    seen.add(p.idProducto);
    return { productoId: p.idProducto, idMayorista: p.idMayorista, nombre: typeof p.nombre === 'string' ? p.nombre : p.idProducto, categoria: p.categoria, stock: p.stock, categoriaOrigen: ['EXPLICITA', 'SECCION', 'DESCRIPCION', 'SIN_CLASIFICAR'].includes(p.categoriaOrigen) ? p.categoriaOrigen : 'EXPLICITA' };
  });
  if (data.revisionInventario !== undefined && (!Number.isSafeInteger(data.revisionInventario) || data.revisionInventario < 0)) throw fail(503, 'Revision de inventario invalida.');
  return { productos, versionInventario: data.versionInventario, actualizadoEn: data.actualizadoEn, revisionInventario: data.revisionInventario };
}

export function olderThan(snapshot, existing) {
  if (!existing) return false;
  if (Number.isSafeInteger(snapshot.revisionInventario) && Number.isSafeInteger(existing.revisionInventario)) return snapshot.revisionInventario < existing.revisionInventario;
  return Date.parse(snapshot.actualizadoEn) < Date.parse(existing.actualizadoEn);
}

export function dashboardResult(config, snapshot) {
  const r = calculate(snapshot, config.filtros);
  const suppliers = new Map();
  const categories = new Map();
  const clasificacion = { explicita: 0, seccion: 0, descripcion: 0, sinClasificar: 0 };
  const originKeys = { EXPLICITA: 'explicita', SECCION: 'seccion', DESCRIPCION: 'descripcion', SIN_CLASIFICAR: 'sinClasificar' };
  for (const p of r.datos) {
    clasificacion[originKeys[p.categoriaOrigen] || 'explicita']++;
    for (const [map, key] of [[suppliers, p.idMayorista], [categories, p.categoria]]) {
      const group = map.get(key) || { totalProductos: 0, productosConStock: 0, productosSinStock: 0, unidadesEnStock: 0 };
      group.totalProductos++; group[p.stock > 0 ? 'productosConStock' : 'productosSinStock']++; group.unidadesEnStock += p.stock;
      map.set(key, group);
    }
  }
  return {
    idDashboard: config.idDashboard, nombre: config.nombre, filtros: config.filtros,
    indicadores: Object.fromEntries(config.indicadores.map(i => [i, r.valores[i]])),
    grupos: r.grupos.map(g => ({ ...g, ...categories.get(g.categoria) })),
    proveedores: [...suppliers].map(([idMayorista, data]) => ({ idMayorista, ...data })).sort((a, b) => b.unidadesEnStock - a.unidadesEnStock),
    clasificacion,
    catalogo: { categorias: [...new Set(snapshot.productos.map(p => p.categoria))].sort(), mayoristas: [...new Set(snapshot.productos.map(p => p.idMayorista))].sort() },
    versionInventario: r.versionInventario, revisionInventario: snapshot.revisionInventario,
    actualizadoEn: r.actualizadoEn, generadoEn: r.generadoEn, sinRegistros: r.sinRegistros,
  };
}
export function calculate(snapshot, selected = {}) {
  const datos = snapshot.productos.filter(p => Object.entries(selected).every(([key, value]) => p[key] === value));
  const valores = { totalProductos: datos.length, productosConStock: 0, productosSinStock: 0, unidadesDisponibles: 0 };
  const grouped = new Map();
  for (const p of datos) {
    valores[p.stock > 0 ? 'productosConStock' : 'productosSinStock']++;
    valores.unidadesDisponibles += p.stock;
    if (!Number.isSafeInteger(valores.unidadesDisponibles)) throw fail(503, 'El total supera la precisión admitida.');
    const group = grouped.get(p.categoria) || { categoria: p.categoria, totalProductos: 0, unidadesEnStock: 0 };
    group.totalProductos++; group.unidadesEnStock += p.stock; grouped.set(p.categoria, group);
  }
  return { datos, valores, grupos: [...grouped.values()].sort((a, b) => a.categoria.localeCompare(b.categoria)), versionInventario: snapshot.versionInventario, actualizadoEn: snapshot.actualizadoEn, generadoEn: new Date().toISOString(), sinRegistros: datos.length === 0 };
}
