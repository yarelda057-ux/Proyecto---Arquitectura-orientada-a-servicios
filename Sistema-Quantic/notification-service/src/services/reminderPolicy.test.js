import test from 'node:test';
import assert from 'node:assert/strict';
import { reminderCopy, selectReminderMilestone } from './reminderPolicy.js';

const DAY = 24 * 60 * 60 * 1000;
const due = new Date('2026-12-30T12:00:00.000Z');
const atDaysBefore = days => new Date(due.getTime() - days * DAY);

test('selecciona los avisos a 5, 3 y 1 día del vencimiento', () => {
  assert.equal(selectReminderMilestone(due, [], atDaysBefore(6)), null);
  assert.equal(selectReminderMilestone(due, [], atDaysBefore(5)), 5);
  assert.equal(selectReminderMilestone(due, [5], atDaysBefore(4)), null);
  assert.equal(selectReminderMilestone(due, [5], atDaysBefore(3)), 3);
  assert.equal(selectReminderMilestone(due, [5, 3], atDaysBefore(1)), 1);
  assert.equal(selectReminderMilestone(due, [5, 3, 1], atDaysBefore(0.5)), null);
  assert.equal(selectReminderMilestone(due, [], due), null);
});

test('si se perdió un hito, el worker elige el aviso correspondiente al plazo actual', () => {
  assert.equal(selectReminderMilestone(due, [], atDaysBefore(2)), null);
  assert.equal(selectReminderMilestone(due, [5], atDaysBefore(0.5)), null);
  assert.equal(selectReminderMilestone(due, [], new Date(atDaysBefore(5).getTime() + 90_000)), 5);
});

test('construye los textos acordados para cada aviso', () => {
  assert.equal(reminderCopy(5).text, 'Te quedan 5 días para subir tu catálogo.');
  assert.equal(reminderCopy(3).text, 'Te quedan 3 días para subir tu catálogo.');
  assert.equal(reminderCopy(1).text, 'Hoy es el último día para subir tu catálogo.');
  assert.throws(() => reminderCopy(0), RangeError);
});
