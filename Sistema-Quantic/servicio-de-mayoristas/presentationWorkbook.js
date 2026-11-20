import ExcelJS from 'exceljs';

                                                               
export async function presentationWorkbook(batch) {
  const book = new ExcelJS.Workbook();
  book.creator = 'Servicio de Gestión de Stock de Mayoristas';
  book.created = new Date(batch.createdAt);
  const sheet = book.addWorksheet('Stock', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    properties: { defaultRowHeight: 26 },
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' },
  });
  sheet.columns = [{ width: 25 }, { width: 90 }, { width: 14 }, { width: 20 }];
  sheet.addRow(['PartNumber', 'Descripción', 'QTY', 'Precio US$']);
  for (const item of batch.filas) sheet.addRow([item.partNumber, item.descripcion, item.cantidad, item.precioUsd]);
  sheet.autoFilter = { from: 'A1', to: 'D' + Math.max(1, sheet.rowCount) };
  sheet.eachRow((row, index) => {
    row.height = index === 1 ? 34 : Math.max(30, Math.ceil(String(row.getCell(2).value || '').length / 85) * 16 + 12);
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { name: 'Calibri', size: 11, color: { argb: index === 1 ? 'FFFFFFFF' : 'FF264536' }, bold: index === 1 || col === 1 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index === 1 ? 'FF19784E' : index % 2 === 0 ? 'FFF0F7F2' : 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: col >= 3 ? 'right' : 'left', wrapText: true };
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFD6E5DB' } } };
      if (index > 1 && col === 3) cell.numFmt = '#,##0';
      if (index > 1 && col === 4) cell.numFmt = '"US$" #,##0.00';
    });
  });
  sheet.headerFooter.oddFooter = '&LStock de mayoristas&R Página &P de &N';
  const info = book.addWorksheet('Datos de la carga', { views: [{ showGridLines: false }] });
  info.columns = [{ width: 26 }, { width: 72 }];
  info.addRows([
    ['DETALLE DEL ARCHIVO', ''],
    ['Proveedor', batch.supplierId],
    ['Archivo de origen', batch.nombreArchivo || 'Sin nombre registrado'],
    ['Fecha de carga (Perú)', new Date(batch.createdAt).toLocaleString('es-PE', { timeZone: 'America/Lima' })],
    ['Estado', batch.estado],
    ['Productos válidos', batch.filas.length],
    ['Identificador de carga', batch.batchId],
    ['Observaciones', batch.errores?.length ? 'Contiene errores. Solo se incluyen los productos válidos guardados.' : 'Datos correspondientes a esta carga histórica.'],
  ]);
  info.mergeCells('A1:B1');
  info.eachRow((row, index) => {
    row.height = index === 1 ? 36 : 32;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { name: 'Calibri', size: 11, bold: index === 1 || col === 1, color: { argb: index === 1 ? 'FFFFFFFF' : 'FF264536' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index === 1 ? 'FF19784E' : index % 2 === 0 ? 'FFF0F7F2' : 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
  });
  return Buffer.from(await book.xlsx.writeBuffer());
}
