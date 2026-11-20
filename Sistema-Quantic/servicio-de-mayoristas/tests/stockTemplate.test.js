import test from 'node:test';
import assert from 'node:assert/strict';
import { stockTemplate } from '../services/stockTemplate.js';
import { ExcelJS } from '../dependencies.js';
import { __testing } from '../routes/wholesaleStockRoutes.js';
test('La plantilla no incluye productos y acepta una fila en el validador real', async () => {
  const buffer = await stockTemplate();
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  const sheet = book.worksheets[0];
  assert.equal(sheet.rowCount, 1);
  assert.deepEqual(sheet.getRow(1).values.slice(1), ['PartNumber', 'Descripción', 'QTY', 'Precio US$', 'Categoría']);
  sheet.addRow(['0000123', 'Switch de prueba', 10, 250.50, 'Redes']);
  const result = await __testing.parseWorkbook(Buffer.from(await book.xlsx.writeBuffer()));
  assert.deepEqual(result.errores, []);
  assert.equal(result.filasCorrectas, 1);
  assert.equal(result.filas[0].partNumber, '0000123');
});
