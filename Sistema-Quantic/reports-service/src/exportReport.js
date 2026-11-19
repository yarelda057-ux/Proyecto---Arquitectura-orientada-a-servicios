import { randomUUID } from 'node:crypto';
import { calculate, fail, object } from './domain.js';
export const reportTypes = { resumen: 'Resumen ejecutivo', detalle: 'Inventario detallado', categorias: 'Analisis por categoria', mayoristas: 'Analisis por mayorista', disponibilidad: 'Disponibilidad de stock', variacion: 'Variacion entre cortes' };
export function reportInput(body) {
  object(body, ['tipo', 'formato', 'filtros', 'periodo', 'incluirDetalle', 'versionInventario']);
  if (!reportTypes[body.tipo] || !['JSON', 'PDF', 'EXCEL'].includes(body.formato)) throw fail(400, 'Tipo o formato de reporte invalido.');
  const f = body.filtros || {};
  object(f, ['categorias', 'mayoristas', 'disponibilidad', 'stockMinimo', 'stockMaximo', 'busqueda', 'orden']);
  for (const key of ['categorias', 'mayoristas']) if (f[key] !== undefined && (!Array.isArray(f[key]) || f[key].length > 100 || f[key].some(v => typeof v !== 'string' || !v.trim() || v.length > 160) || new Set(f[key]).size !== f[key].length)) throw fail(400, 'Seleccion de filtros invalida.');
  for (const key of ['stockMinimo', 'stockMaximo']) if (f[key] !== undefined && (!Number.isSafeInteger(f[key]) || f[key] < 0)) throw fail(400, 'El stock debe ser un entero no negativo.');
  if (f.stockMinimo !== undefined && f.stockMaximo !== undefined && f.stockMinimo > f.stockMaximo) throw fail(400, 'El minimo supera al maximo.');
  if (f.disponibilidad && !['todos', 'conStock', 'sinStock'].includes(f.disponibilidad)) throw fail(400, 'Disponibilidad invalida.');
  if (f.orden && !['nombre', 'stockAsc', 'stockDesc', 'categoria', 'mayorista'].includes(f.orden)) throw fail(400, 'Orden invalido.');
  if (f.busqueda !== undefined && (typeof f.busqueda !== 'string' || f.busqueda.length > 160)) throw fail(400, 'Busqueda invalida.');
  if (body.incluirDetalle !== undefined && typeof body.incluirDetalle !== 'boolean') throw fail(400, 'Detalle invalido.');
  const periodo = body.periodo || { tipo: 'actual' };
  object(periodo, ['tipo', 'desde', 'hasta']);
  if (!['actual', 'mes', 'trimestre', 'semestre', 'ano', 'personalizado'].includes(periodo.tipo)) throw fail(400, 'Periodo invalido.');
  if (periodo.tipo !== 'actual') {
    const valid = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    if (!valid(periodo.desde) || !valid(periodo.hasta) || periodo.desde > periodo.hasta || periodo.hasta > today || Date.parse(periodo.hasta) - Date.parse(periodo.desde) > 366 * 10 * 86400000) throw fail(400, 'Selecciona fechas validas, sin fechas futuras y con un maximo de diez anos.');
  } else if (periodo.desde || periodo.hasta || body.tipo === 'variacion') throw fail(400, 'La variacion requiere un periodo con fechas.');
  return { ...body, filtros: f, periodo, incluirDetalle: body.incluirDetalle ?? body.tipo === 'detalle' };
}
function select(snapshot, f) {
  const productos = snapshot.productos.filter(p => (!f.categorias?.length || f.categorias.includes(p.categoria)) && (!f.mayoristas?.length || f.mayoristas.includes(p.idMayorista)) && (f.disponibilidad !== 'conStock' || p.stock > 0) && (f.disponibilidad !== 'sinStock' || p.stock === 0) && (f.stockMinimo === undefined || p.stock >= f.stockMinimo) && (f.stockMaximo === undefined || p.stock <= f.stockMaximo) && (!f.busqueda || (p.nombre + ' ' + p.productoId).toLocaleLowerCase('es').includes(f.busqueda.toLocaleLowerCase('es'))));
  const sort = f.orden === 'stockAsc' ? (a,b) => a.stock-b.stock : f.orden === 'stockDesc' ? (a,b) => b.stock-a.stock : (a,b) => String(a[f.orden === 'mayorista' ? 'idMayorista' : f.orden === 'categoria' ? 'categoria' : 'nombre']).localeCompare(String(b[f.orden === 'mayorista' ? 'idMayorista' : f.orden === 'categoria' ? 'categoria' : 'nombre']), 'es');
  productos.sort(sort);
  return calculate({ ...snapshot, productos });
}
export async function buildReport(input, source, options) {
  let cierre, inicio, periodMeta;
  if (input.periodo.tipo === 'actual') cierre = await source({ ...options, expected: input.versionInventario });
  else {
    periodMeta = await source({ ...options, period: input.periodo });
    if (!periodMeta.cierre) throw fail(404, 'No hay una version historica guardada para el cierre seleccionado.');
    cierre = await source({ ...options, expected: periodMeta.cierre.versionInventario });
    if (input.tipo === 'variacion') {
      if (!periodMeta.inicio) throw fail(404, 'No hay una version anterior al inicio. No se puede calcular una variacion fiable.');
      inicio = await source({ ...options, expected: periodMeta.inicio.versionInventario });
    }
  }
  const r = select(cierre, input.filtros), groups = new Map();
  for (const p of r.datos) {
    const key = input.tipo === 'mayoristas' ? p.idMayorista : input.tipo === 'disponibilidad' ? (p.stock > 0 ? 'Con stock' : 'Sin stock') : p.categoria;
    const row = groups.get(key) || { grupo: key, productos: 0, unidades: 0, sinStock: 0 };
    row.productos++; row.unidades += p.stock; if (!p.stock) row.sinStock++; groups.set(key, row);
  }
  const report = { idReporte: 'REP-' + randomUUID(), titulo: reportTypes[input.tipo], tipo: input.tipo, formato: input.formato, filtros: input.filtros, periodo: input.periodo, incluirDetalle: input.incluirDetalle, valores: r.valores, grupos: [...groups.values()].sort((a,b) => b.unidades-a.unidades), datos: input.incluirDetalle ? r.datos : [], versionInventario: r.versionInventario, actualizadoEn: r.actualizadoEn, generadoEn: r.generadoEn, sinRegistros: r.sinRegistros, nota: input.periodo.tipo === 'actual' ? 'Inventario actual. Las cantidades representan existencias, no ventas.' : 'Existencias al cierre: ultima version guardada antes del fin del periodo (hora de Peru). No se suman inventarios de diferentes fechas.' };
  if (inicio) {
    const base = select(inicio, input.filtros);
    report.comparacion = { inicio: { versionInventario: inicio.versionInventario, actualizadoEn: inicio.actualizadoEn, ...base.valores }, cierre: r.valores, variacionUnidades: r.valores.unidadesDisponibles - base.valores.unidadesDisponibles, variacionProductos: r.valores.totalProductos - base.valores.totalProductos };
    report.nota += ' Variacion neta entre cortes; no equivale a ventas o movimientos. Los filtros se aplican a cada corte por separado.';
  }
  return report;
}
