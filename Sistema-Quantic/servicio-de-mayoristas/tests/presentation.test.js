import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { presentationWorkbook } from '../presentationWorkbook.js';
import { __testing } from '../routes/wholesaleStockRoutes.js';
test('Excel presentado conserva importación, importes, filtros y encabezado fijo', async () => {
  const batch = { supplierId: 'MAY-TEST', batchId: 'LOTE-TEST', createdAt: new Date('2026-11-11T12:00:00Z'), estado: 'PROCESADO', filas: [{ partNumber: 'FG-40F', descripcion: 'Firewall', cantidad: 16, precioUsd: 420.43 }] };
  const buffer = await presentationWorkbook(batch);
  const book = new ExcelJS.Workbook(); await book.xlsx.load(buffer);
  assert.equal(book.worksheets[0].getCell('D2').value, 420.43);
  assert.equal(book.worksheets[0].views[0].ySplit, 1);
  assert.ok(book.worksheets[0].autoFilter);
  assert.match(book.worksheets[0].getCell('D2').numFmt, /US/);
  assert.equal(book.worksheets.length, 2);
  const parsed = await __testing.parseWorkbook(buffer);
  assert.equal(parsed.filasCorrectas, 1);
  assert.deepEqual(parsed.errores, []);
});
