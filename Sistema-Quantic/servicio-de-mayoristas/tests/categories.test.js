import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { classifyCategory, inferCategory, productCategory } from '../services/categories.js';
import { __testing } from '../routes/wholesaleStockRoutes.js';

test('classification uses specific product terms, never vendor or quantity alone', () => {
  for (const [description, expected] of [['FortiGate 40F', 'Seguridad de red'], ['Switch Cisco 24 ports', 'Redes'], ['Laptop ThinkPad', 'Computadoras'], ['FortiGate renewal license', 'Software y licencias'], ['Rackmount kit for firewall', 'Accesorios'], ['Dell', null], ['PN-0001', null], ['Producto estándar', null]]) assert.equal(inferCategory(description), expected, description);
});
test('explicit category wins over header and description; unknown stays unclassified', () => {
  assert.deepEqual(classifyCategory({ explicit: 'Mi categoría', section: 'Redes', description: 'Laptop' }), { categoria: 'Mi categoría', categoriaOrigen: 'EXPLICITA' });
  assert.equal(classifyCategory({ section: 'Redes', description: 'Producto sin detalle' }).categoriaOrigen, 'SECCION');
  assert.equal(classifyCategory({ description: 'ABCD' }).categoriaOrigen, 'SIN_CLASIFICAR');
  assert.deepEqual(productCategory({ categoria: 'Sin categoría', descripcion: 'Servidor PowerEdge' }), { categoria: 'Servidores', categoriaOrigen: 'DESCRIPCION' });
});
test('Excel without category column uses section headers and resets unknown sections', async () => {
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('Stock');
  sheet.addRows([['PartNumber', 'Descripcion', 'QTY', 'Precio US$'], ['Switches'], ['A1', 'Equipo gestionable', 3, 20], [null, 'Otros productos'], ['A2', 'Producto desconocido', 1, 5], ['A3', 'SSD 1 TB', 1, 50]]);
  sheet.mergeCells('A2:D2');
  const result = await __testing.parseWorkbook(Buffer.from(await book.xlsx.writeBuffer()));
  assert.deepEqual(result.errores, []);
  assert.deepEqual(result.filas.map(row => row.categoria), ['Redes', 'Sin categoría', 'Almacenamiento']);
});
test('Excel optional category takes priority and empty cells fall back to description', async () => {
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('Stock');
  sheet.addRows([['PartNumber', 'Descripcion', 'QTY', 'Precio US$', 'Categoria'], ['A1', 'Switch', 3, 20, 'Especial'], ['A2', 'UPS 1000VA', 2, 20]]);
  const result = await __testing.parseWorkbook(Buffer.from(await book.xlsx.writeBuffer()));
  assert.deepEqual(result.filas.map(row => row.categoria), ['Especial', 'Energía']);
});
