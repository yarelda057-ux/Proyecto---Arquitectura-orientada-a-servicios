import { deflateRawSync } from 'node:zlib';
import { fail } from './domain.js';
const num = n => new Intl.NumberFormat('es-PE').format(n);
const date = d => new Date(d).toLocaleString('es-PE', { timeZone: 'America/Lima' });
const filtersText = r => Object.entries(r.filtros).map(([k,v]) => k + ': ' + (Array.isArray(v) ? v.join(', ') || 'Todos' : v)).join(' | ') || 'Todas las categorias y todos los mayoristas';
const periodText = r => r.periodo.tipo === 'actual' ? 'Inventario actual' : r.periodo.desde + ' a ' + r.periodo.hasta + ' (America/Lima)';

                                                                                     
export function pdfFile(r) {
  if (r.datos.length > 10000) throw fail(413, 'Para PDF con detalle, reduce la seleccion a 10000 productos o descarga Excel.');
  const pages = []; let commands = [], y = 0;
  const safe = s => String(s).replace(/[^\x20-\xff]/g, '-').replace(/[\\()]/g, '\\$&');
  const text = (s,x,yy,size=10,color='0.12 0.19 0.28') => commands.push(`${color} rg BT /F1 ${size} Tf ${x} ${yy} Td (${safe(s)}) Tj ET`);
  const box = (x,yy,w,h,c) => commands.push(`${c} rg ${x} ${yy} ${w} ${h} re f`);
  function page() {
    if (commands.length) pages.push(commands.join('\n'));
    commands = []; box(0,758,595,84,'0.06 0.13 0.23'); text('QUANTIC  /  INVENTARIO',32,807,11,'0.45 0.87 0.86'); text(r.titulo,32,777,22,'1 1 1');
    text(r.idReporte,32,26,8); text('Pagina ' + (pages.length+1),510,26,8); y=732;
  }
  function line(s,size=10) { if(y<62) page(); text(s,32,y,size); y-=size+8; }
  function wrap(s,width=95) {
    for (const part of String(s).match(new RegExp('.{1,'+width+'}(?:\\s|$)|.{1,'+width+'}', 'g')) || ['']) line(part.trim());
  }
  page(); line(periodText(r),12); line('Datos: ' + date(r.actualizadoEn) + ' | ' + r.versionInventario); line('Generado: ' + date(r.generadoEn));
  wrap(filtersText(r)); y-=8;
  const kpis=[['Productos',r.valores.totalProductos],['Con stock',r.valores.productosConStock],['Sin stock',r.valores.productosSinStock],['Unidades',r.valores.unidadesDisponibles]];
  for(let i=0;i<4;i++){const x=32+i*135; box(x,y-60,126,64,'0.92 0.96 0.97'); text(kpis[i][0],x+10,y-12,10); text(num(kpis[i][1]),x+10,y-41,20,i===2?'0.75 0.38 0.08':'0.02 0.42 0.47');}
  y-=88;
  if(r.comparacion){line('Variacion neta: ' + num(r.comparacion.variacionUnidades) + ' unidades',15); line('Base: '+r.comparacion.inicio.versionInventario+' | '+date(r.comparacion.inicio.actualizadoEn)); y-=8;}
  line('Distribucion de unidades',15);
  const max=Math.max(1,...r.grupos.map(g=>g.unidades));
  for(const g of r.grupos){ if(y<105) page(); text(g.grupo.slice(0,65),32,y,10); text(num(g.unidades),495,y,10); y-=17; box(32,y,530,8,'0.92 0.94 0.96'); box(32,y,530*g.unidades/max,8,'0.03 0.50 0.55'); y-=25; }
  if(!r.grupos.length) line('No hay productos que coincidan con los filtros.');
  y-=8; wrap(r.nota);
  if(r.incluirDetalle){
    page(); line('Detalle de productos',16);
    const header=()=>{box(32,y-6,530,24,'0.90 0.94 0.97'); text('Producto / Categoria',38,y+2);text('Mayorista',360,y+2);text('Stock',517,y+2);y-=24;}; header();
    for(let i=0;i<r.datos.length;i++){const p=r.datos[i];if(y<105){page();header();}if(i%2===0)box(32,y-34,530,48,'0.97 0.98 0.99');text(p.nombre.slice(0,55),38,y,9);text(p.nombre.slice(55,110),38,y-11,9);text(p.categoria.slice(0,55),38,y-24,8,'0.35 0.40 0.45');text(p.idMayorista.slice(0,24),360,y,8);text(p.idMayorista.slice(24),360,y-12,8);text(num(p.stock),517,y,9);y-=50;}
  }
  pages.push(commands.join('\n'));
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'];
  const ids=[];
  for(const content of pages){ const id=objects.length+1;ids.push(id);objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${id+1} 0 R >>`);objects.push(`<< /Length ${Buffer.byteLength(content,'latin1')} >>\nstream\n${content}\nendstream`); }
  objects[1]=`<< /Type /Pages /Count ${ids.length} /Kids [${ids.map(id=>id+' 0 R').join(' ')}] >>`;
  let output='%PDF-1.4\n', offsets=[0];
  for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(output,'latin1'));output+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
  const xref=Buffer.byteLength(output,'latin1');output+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output,'latin1');
}
const xml = value => String(value).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const relns='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const column=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
function sheet(rows,{filter=false,chart=false}={}) {
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${ns}" xmlns:r="${relns}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="42" customWidth="1"/><col min="2" max="4" width="28" customWidth="1"/><col min="5" max="5" width="18" customWidth="1"/></cols><sheetData>${rows.map((row,i)=>`<row r="${i+1}" ht="24" customHeight="1">${row.map((v,j)=>`<c r="${column(j)}${i+1}" s="${i===0?1:typeof v==='number'?3:2}"${typeof v==='number'||v?.formula?'':' t="inlineStr"'}>${v?.formula?`<f>${xml(v.formula)}</f><v>${v.value}</v>`:typeof v==='number'?`<v>${v}</v>`:`<is><t xml:space="preserve">${xml(v??'')}</t></is>`}</c>`).join('')}</row>`).join('')}</sheetData>${filter&&rows.length>1?`<autoFilter ref="A1:${column(rows[0].length-1)}${rows.length}"/>`:''}${filter&&rows.length>1?`<conditionalFormatting sqref="E2:E${rows.length}"><cfRule type="dataBar" priority="1"><dataBar><cfvo type="min"/><cfvo type="max"/><color rgb="FF087F8C"/></dataBar></cfRule></conditionalFormatting>`:''}<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>${chart?'<drawing r:id="rId1"/>':''}</worksheet>`;
}
function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function zip(files){const parts=[],central=[];let offset=0;for(const [name,value] of Object.entries(files)){const nameBuf=Buffer.from(name),raw=Buffer.from(value),data=deflateRawSync(raw),crc=crc32(raw),h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(8,8);h.writeUInt32LE(crc,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(raw.length,22);h.writeUInt16LE(nameBuf.length,26);parts.push(h,nameBuf,data);const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(8,10);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(raw.length,24);c.writeUInt16LE(nameBuf.length,28);c.writeUInt32LE(offset,42);central.push(c,nameBuf);offset+=h.length+nameBuf.length+data.length;}const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...parts,directory,end]);}
export function excelFile(r) {
  const summary=[['QUANTIC · '+r.titulo,'Valor'],['Periodo',periodText(r)],['Version',r.versionInventario],['Datos al',date(r.actualizadoEn)],['Generado',date(r.generadoEn)],['Productos',r.valores.totalProductos],['Con stock',r.valores.productosConStock],['Sin stock',r.valores.productosSinStock],['Unidades',r.valores.unidadesDisponibles],['Alcance',r.nota]];
  if(r.incluirDetalle&&r.datos.length) summary.push(['Unidades visibles (filtra Detalle)',{formula:`SUBTOTAL(109,Detalle!E2:E${r.datos.length+1})`,value:r.valores.unidadesDisponibles}]);
  if(r.comparacion)summary.push(['Version inicial',r.comparacion.inicio.versionInventario],['Fecha inicial',date(r.comparacion.inicio.actualizadoEn)],['Variacion neta de unidades',r.comparacion.variacionUnidades],['Variacion de productos',r.comparacion.variacionProductos]);
  const groups=[['Grupo','Productos','Unidades','Sin stock'],...r.grupos.map(g=>[g.grupo,g.productos,g.unidades,g.sinStock])];
  const details=[['Producto','Identificador','Categoria','Mayorista','Stock'],...r.datos.map(p=>[p.nombre,p.productoId,p.categoria,p.idMayorista,p.stock])];
  const filterRows=[['Parametro','Seleccion'],...Object.entries(r.filtros).map(([k,v])=>[k,Array.isArray(v)?v.join(', ')||'Todos':v]),['Detalle incluido',r.incluirDetalle?'Si':'No'],['Criterio temporal',r.nota]];
  const sheets=['Resumen','Distribucion','Detalle','Filtros'];
  const relations=items=>`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(([id,type,target])=>`<Relationship Id="${id}" Type="${relns}/${type}" Target="${target}"/>`).join('')}</Relationships>`;
  const files={
    '_rels/.rels':relations([['rId1','officeDocument','xl/workbook.xml']]),
    'xl/workbook.xml':`<workbook xmlns="${ns}" xmlns:r="${relns}"><sheets>${sheets.map((s,i)=>`<sheet name="${s}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
    'xl/_rels/workbook.xml.rels':relations([...sheets.map((_,i)=>['rId'+(i+1),'worksheet','worksheets/sheet'+(i+1)+'.xml']),['rId5','styles','styles.xml']]),
    'xl/styles.xml':`<styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/><color rgb="FF182E46"/></font><font><b/><sz val="12"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF087F8C"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf fontId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="3" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    'xl/worksheets/sheet1.xml':sheet(summary), 'xl/worksheets/sheet2.xml':sheet(groups,{chart:r.grupos.length>0}), 'xl/worksheets/sheet3.xml':sheet(details,{filter:true}), 'xl/worksheets/sheet4.xml':sheet(filterRows)
  };
  const overrides=sheets.map((_,i)=>['/xl/worksheets/sheet'+(i+1)+'.xml','application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml']);
  if(r.grupos.length){
    files['xl/worksheets/_rels/sheet2.xml.rels']=relations([['rId1','drawing','../drawings/drawing1.xml']]);
    files['xl/drawings/_rels/drawing1.xml.rels']=relations([['rId1','chart','../charts/chart1.xml']]);
    files['xl/drawings/drawing1.xml']=`<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:twoCellAnchor><xdr:from><xdr:col>5</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>15</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>22</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Unidades por grupo"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="${relns}" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`;
    const end=r.grupos.length+1;
    files['xl/charts/chart1.xml']=`<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart><c:autoTitleDeleted val="1"/><c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>Unidades</c:v></c:tx><c:spPr><a:solidFill><a:srgbClr val="087F8C"/></a:solidFill></c:spPr><c:cat><c:strRef><c:f>Distribucion!$A$2:$A$${end}</c:f><c:strCache><c:ptCount val="${r.grupos.length}"/>${r.grupos.map((g,i)=>`<c:pt idx="${i}"><c:v>${xml(g.grupo)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>Distribucion!$C$2:$C$${end}</c:f><c:numCache><c:formatCode>#,##0</c:formatCode><c:ptCount val="${r.grupos.length}"/>${r.grupos.map((g,i)=>`<c:pt idx="${i}"><c:v>${g.unidades}</c:v></c:pt>`).join('')}</c:numCache></c:numRef></c:val></c:ser><c:axId val="1"/><c:axId val="2"/></c:barChart><c:catAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="b"/><c:crossAx val="2"/><c:crosses val="autoZero"/></c:catAx><c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="l"/><c:majorGridlines/><c:numFmt formatCode="#,##0" sourceLinked="0"/><c:crossAx val="1"/><c:crosses val="autoZero"/></c:valAx></c:plotArea><c:plotVisOnly val="1"/></c:chart></c:chartSpace>`;
    overrides.push(['/xl/drawings/drawing1.xml','application/vnd.openxmlformats-officedocument.drawing+xml'],['/xl/charts/chart1.xml','application/vnd.openxmlformats-officedocument.drawingml.chart+xml']);
  }
  files['[Content_Types].xml']=`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${[['/xl/workbook.xml','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'],['/xl/styles.xml','application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml'],...overrides].map(([part,type])=>`<Override PartName="${part}" ContentType="${type}"/>`).join('')}</Types>`;
  return zip(files);
}
export function reportAttachment(report) {
  if(report.formato==='JSON') return {};
  const pdf=report.formato==='PDF';
  const buffer=pdf?pdfFile(report):excelFile(report);
  return { archivo: { nombre: report.idReporte+(pdf?'.pdf':'.xlsx'), mime: pdf?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', base64: buffer.toString('base64') } };
}
