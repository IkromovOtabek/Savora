// Savora Market savati (lib/marketCartCore.ts) — sof funksiyalar testi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampQty, addLine, setLineQty, removeLine, syncLines, parseStoredCart, mergeLines, cartCount, MAX_LINES,
} from '../lib/marketCartCore.ts';

const card = (id, extra = {}) => ({
  id, name: `Tovar ${id}`, price: 10000, priceFrom: false, shopName: 'Do\'kon', shopSlug: 'dokon', qty: 5, fractional: false, ...extra,
});

test('miqdor: butun birlik pastga, kasr 3 xonagacha, qoldiqdan oshmaydi', () => {
  assert.equal(clampQty(2.7, 5, false), 2);
  assert.equal(clampQty(9, 5, false), 5);
  assert.equal(clampQty(1.23456, 5, true), 1.235);
  assert.equal(clampQty(0.3, 0.25, true), 0.25);
  assert.equal(clampQty(-1, 5, false), 0);
  assert.equal(clampQty(NaN, 5, false), 0);
  assert.equal(clampQty(7, 0, false), 7, 'max 0 — cheklanmaydi (sotuvdan olingan qator)');
});

test('qo\'shish: yangi qator, bor bo\'lsa miqdor qo\'shiladi va qoldiq bilan cheklanadi', () => {
  let items = addLine([], card('a'), 1);
  assert.equal(items.length, 1);
  assert.equal(items[0].max, 5);
  items = addLine(items, card('a'), 3);
  assert.equal(items[0].qty, 4);
  items = addLine(items, card('a', { price: 12000 }), 10);
  assert.equal(items[0].qty, 5, 'qoldiqdan oshmaydi');
  assert.equal(items[0].price, 12000, 'kartochka ma\'lumoti yangilanadi');
  assert.deepEqual(addLine(items, card('b', { qty: 0 }), 1), items, 'qoldig\'i yo\'q tovar qo\'shilmaydi');
});

test('qatorlar soni chegarasi', () => {
  let items = [];
  for (let i = 0; i < MAX_LINES + 3; i++) items = addLine(items, card(`x${i}`), 1);
  assert.equal(items.length, MAX_LINES);
});

test('miqdorni o\'rnatish: 0 — qator o\'chadi, kasr birlik saqlanadi', () => {
  const kg = addLine([], card('k', { fractional: true, unit: 'kg', qty: 2.5 }), 1);
  assert.equal(setLineQty(kg, 'k', 1.1)[0].qty, 1.1);
  assert.equal(setLineQty(kg, 'k', 9)[0].qty, 2.5);
  assert.equal(setLineQty(kg, 'k', 0).length, 0);
  assert.equal(removeLine(kg, 'k').length, 0);
});

test('server bilan moslash: narx o\'zgarishi, sotuvdan olinish, o\'zgarishsiz holat', () => {
  const items = addLine(addLine([], card('a'), 2), card('b'), 4);

  const same = syncLines(items, [card('a'), card('b')]);
  assert.equal(same.changed, false);

  const price = syncLines(items, [card('a', { price: 11000 }), card('b')]);
  assert.equal(price.changed, true);
  assert.equal(price.items[0].price, 11000);

  const gone = syncLines(items, [card('a')]);
  assert.equal(gone.changed, true);
  assert.equal(gone.items[1].max, 0, 'javobda yo\'q — sotuvda yo\'q');
  assert.equal(cartCount(gone.items), 1);

  const less = syncLines(items, [card('a'), card('b', { qty: 3 })]);
  assert.equal(less.changed, true);
  assert.equal(less.items[1].qty, 3, 'miqdor qoldiqqa tushiriladi');

  const back = syncLines(gone.items, [card('a'), card('b')]);
  assert.equal(back.changed, true, 'qaytib sotuvga chiqdi');
  assert.equal(back.items[1].max, 5);
});

test('saqlangan savatni o\'qish va birlashtirish', () => {
  assert.deepEqual(parseStoredCart(null), []);
  assert.deepEqual(parseStoredCart('buzilgan'), []);
  assert.deepEqual(parseStoredCart('{"a":1}'), []);
  const stored = JSON.stringify([{ ...addLine([], card('a'), 2)[0] }, { id: 5 }, { id: 'z', qty: 0, price: 1, name: 'z', shopSlug: 's' }]);
  const parsed = parseStoredCart(stored);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, 'a');

  const merged = mergeLines(parsed, addLine([], card('a'), 1).concat(addLine([], card('b'), 1)));
  assert.deepEqual(merged.map((x) => [x.id, x.qty]), [['a', 1], ['b', 1]]);
});
