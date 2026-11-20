import { ExcelJS } from '../dependencies.js';
export async function stockTemplate() {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Catálogo');
  sheet.columns = [
    { header: 'PartNumber', key: 'partNumber', width: 25 },
    { header: 'Descripción', key: 'descripcion', width: 55 },
    { header: 'QTY', key: 'cantidad', width: 12 },
    { header: 'Precio US$', key: 'precioUsd', width: 18 },
    { header: 'Categoría', key: 'categoria', width: 28 }
  ];
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getRow(1).height = 26;
  sheet.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF087F80' } };
    cell.alignment = { vertical: 'middle' };
  });
  sheet.getColumn(1).numFmt = '@';
  sheet.getColumn(3).numFmt = '0';
  sheet.getColumn(4).numFmt = '0.00';
  return Buffer.from(await book.xlsx.writeBuffer());
}
