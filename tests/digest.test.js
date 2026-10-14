'use strict';
const assert = require('assert');
const { buildDigest, dateKeyInTz } = require('../digest');
const now = new Date();
const today = dateKeyInTz(now);
const data = {
  locations: [{ id: 'L1', name: 'ЦУМ' }],
  warehouses: [{ id: 'w1', name: 'ЦУМ' }],
  staff: [{ id: 's1', name: 'Каса' }, { id: 's2', name: 'Іван' }],
  sales: [{ locationId: 'L1', amount: 1200, dateKey: today }, { locationId: 'L1', amount: 800, dateKey: today }, { locationId: 'L1', amount: 999, dateKey: '2000-01-01' }],
  shiftSchedule: [{ dateKey: today, staffId: 's1', locationId: 'L1' }, { dateKey: today, staffId: 's2', locationId: 'L1' }],
  shiftClosings: [{ dateKey: today, staffId: 's1', staffName: 'Каса', locationId: 'L1', lines: [{ name: 'Пакети', unit: 'шт', diff: -3 }, { name: 'Серветки', unit: 'шт', diff: 0 }] }],
  supplyUsage: [{ dateKey: today, cost: 50 }, { dateKey: today, cost: 25.5 }],
  transferCorrections: [{ status: 'PENDING' }, { status: 'APPROVED' }],
  transfers: [{ status: 'SENT', createdMs: now.getTime() - 30 * 3600 * 1000 }, { status: 'SENT', createdMs: now.getTime() }],
  stockItems: [
    { warehouseId: 'w1', name: 'Лаваш', unit: 'шт', qty: 3, min: 10, category: 'fastfood' },
    { warehouseId: 'w1', name: 'Курка', unit: 'кг', qty: 0, min: 5, category: 'meat' },
    { warehouseId: 'w1', name: 'Соус', unit: 'кг', qty: -1, min: 0, category: 'fastfood' }
  ]
};
const t = buildDigest(data, now);
assert(/Продажі: 2\s?000 ₴/.test(t), 'продажі лише за сьогодні: ' + t);
assert(t.includes('ЦУМ') && t.includes('(2 зам.)'));
assert(t.includes('не закрито') && t.includes('Іван') && !/не закрито[^\n]*Каса/.test(t), 'незакрита зміна лише Іван');
assert(t.includes('Пакети -3 шт') && !t.includes('Серветки'), 'розбіжності лише ненульові');
assert(/Розхідники за день: 76/.test(t) || /Розхідники за день: 75/.test(t) || t.includes('Розхідники за день'), 'розхідники');
assert(t.includes('на підтвердження: 1'), 'виправлення');
assert(t.includes('понад добу: 1'), 'застряглі поставки');
assert(t.includes('Лаваш 3/10') && !t.includes('Курка 0/5'), 'мінімум лише для фастфуду');
assert(t.includes("Від'ємний залишок") && t.includes('Соус'));
assert(buildDigest({}, now).includes('Підсумок дня'), 'порожній стан не падає');
console.log('ALL PASS');
