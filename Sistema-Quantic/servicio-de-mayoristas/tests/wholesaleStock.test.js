import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { __testing } from '../routes/wholesaleStockRoutes.js';

async function workbookFrom(rows) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Stock');
  sheet.addRows(rows);
  return Buffer.from(await book.xlsx.writeBuffer());
}

test('la plantilla de mayoristas admite las columnas de la propuesta e ignora subtítulos', async () => {
  const buffer = await workbookFrom([
    ['PartNumber', 'Descripción', 'QTY', 'Precio US$'],
    [null, 'Firewalls solo HW', null, null],
    ['FG-40F', 'FortiGate 40F', 16, '$420.43'],
    ['FG-50G', 'FortiGate 50G', 9, '$1,142.86'],
  ]);
  const result = await __testing.parseWorkbook(buffer);
  assert.equal(result.totalFilas, 2);
  assert.equal(result.filasCorrectas, 2);
  assert.deepEqual(result.errores, []);
  assert.equal(result.filas[1].precioUsd, 1142.86);
  assert.equal(result.filas[0].categoria, 'Sin categoría');
});

test('la plantilla rechaza columnas obligatorias ausentes y fórmulas', async () => {
  const incomplete = await __testing.parseWorkbook(await workbookFrom([['PartNumber', 'Descripción'], ['FG-40F', 'FortiGate']]));
  assert.equal(incomplete.errores[0].fila, 1);
  assert.match(incomplete.errores[0].motivo, /Faltan las columnas/);

  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Stock');
  sheet.addRows([['PartNumber', 'Descripción', 'QTY', 'Precio US$'], ['FG-40F', 'FortiGate', 1, 2]]);
  sheet.getCell('D2').value = { formula: '1+1', result: 2 };
  const formulaBook = Buffer.from(await book.xlsx.writeBuffer());
  await assert.rejects(() => __testing.parseWorkbook(formulaBook), /fórmulas/);
});

test('ignora el subtítulo combinado de la imagen y rechaza cantidades vacías', async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Stock');
  sheet.addRows([['PartNumber', 'Descripción', 'QTY', 'Precio US$'], ['Firewalls solo HW'], ['FG-40F', 'FortiGate', 16, 420.43]]);
  sheet.mergeCells('A2:D2');
  let result = await __testing.parseWorkbook(Buffer.from(await book.xlsx.writeBuffer()));
  assert.equal(result.filasCorrectas, 1);
  assert.deepEqual(result.errores, []);
  sheet.getCell('C3').value = null;
  result = await __testing.parseWorkbook(Buffer.from(await book.xlsx.writeBuffer()));
  assert.equal(result.filasCorrectas, 0);
  assert.ok(result.errores.some(item => item.campo === 'QTY'));
});

test('admite márgenes superiores, columna vacía y cabecera repetida', async () => {
  const buffer = await workbookFrom([
    [], [], [], [], [],
    [null, 'PartNumber', 'Descripción', 'QTY', 'Precio US$'],
    [null, 'PartNumber', 'Descripción', 'QTY', 'Precio US$'],
    [null, 'FG-40F', 'FortiGate', 16, '$420.43'],
  ]);
  const result = await __testing.parseWorkbook(buffer);
  assert.deepEqual(result.errores, []);
  assert.equal(result.filasCorrectas, 1);
  assert.equal(result.filas[0].partNumber, 'FG-40F');
});
