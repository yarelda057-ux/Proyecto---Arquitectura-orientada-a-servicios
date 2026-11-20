import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport,reportInput } from '../src/exportReport.js';
import { pdfFile,excelFile } from '../src/reportFiles.js';
const snapshot={versionInventario:'INV-000002',actualizadoEn:'2026-01-31T16:00:00Z',productos:[{productoId:'P1',nombre:'Switch',categoria:'Redes',idMayorista:'M1',stock:20},{productoId:'P2',nombre:'Servidor',categoria:'Servidores',idMayorista:'M2',stock:0}]};
test('combined filters affect all metrics and downloadable detail consistently',async()=>{
  const input=reportInput({tipo:'mayoristas',formato:'JSON',incluirDetalle:true,filtros:{categorias:['Redes'],mayoristas:['M1'],disponibilidad:'conStock',stockMinimo:10,busqueda:'switch'}});
  const r=await buildReport(input,async()=>snapshot,{});
  assert.equal(r.valores.totalProductos,1);assert.equal(r.valores.unidadesDisponibles,20);assert.equal(r.datos.length,1);assert.equal(r.grupos[0].grupo,'M1');
  assert.equal(pdfFile(r).subarray(0,8).toString(),'%PDF-1.4');assert.equal(excelFile(r).readUInt32LE(),0x04034b50);
});
test('period uses stored closing snapshot and opening baseline, never current data',async()=>{
  const input=reportInput({tipo:'variacion',formato:'JSON',periodo:{tipo:'mes',desde:'2026-01-01',hasta:'2026-01-31'}});
  const calls=[];
  const r=await buildReport(input,async options=>{calls.push(options);if(options.period)return {inicio:{versionInventario:'INV-000001'},cierre:{versionInventario:'INV-000002'}};assert.ok(options.expected);return options.expected==='INV-000001'?{...snapshot,versionInventario:'INV-000001',productos:[{...snapshot.productos[0],stock:25}]}:snapshot;},{});
  assert.equal(r.comparacion.variacionUnidades,-5);assert.equal(r.versionInventario,'INV-000002');assert.equal(calls.length,3);
});
test('missing history and invalid ranges never fall back to a fabricated report',async()=>{
  const input=reportInput({tipo:'resumen',formato:'PDF',periodo:{tipo:'mes',desde:'2026-01-01',hasta:'2026-01-31'}});
  await assert.rejects(buildReport(input,async()=>({inicio:null,cierre:null}),{}),{status:404});
  for(const periodo of [{tipo:'mes',desde:'2026-02-30',hasta:'2026-03-01'},{tipo:'ano',desde:'2099-01-01',hasta:'2099-12-31'},{tipo:'personalizado',desde:'2026-01-02',hasta:'2026-01-01'}])assert.throws(()=>reportInput({...input,periodo}),{status:400});
  assert.throws(()=>reportInput({...input,filtros:{stockMinimo:20,stockMaximo:10}}),{status:400});
});
