// Bosh sahifa tushum davri (lib/homePeriod.ts) — sof funksiyalar testi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toDayKey, isDayKey, fromDayKey, normalizeDay, monthGrid, sameMonth } from '../lib/homePeriod.ts';

test('kun kaliti: mahalliy vaqt bo\'yicha, nol bilan to\'ldiriladi', () => {
  assert.equal(toDayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(toDayKey(fromDayKey('2026-11-22')), '2026-11-22');
});

test('isDayKey: haqiqiy sana va format', () => {
  assert.ok(isDayKey('2026-11-22'));
  assert.ok(!isDayKey('2026-02-30'), 'mavjud bo\'lmagan kun');
  assert.ok(!isDayKey('2026-1-5'));
  assert.ok(!isDayKey('today'));
});

test('bugun va kecha — preset, boshqa kun o\'z holicha', () => {
  const now = new Date(2026, 10, 22, 0, 18);
  assert.equal(normalizeDay('2026-11-22', now), 'today');
  assert.equal(normalizeDay('2026-11-21', now), 'yesterday');
  assert.equal(normalizeDay('2026-11-20', now), '2026-11-20');
  // Oy chegarasi: 1-dekabrda kecha = 30-noyabr
  assert.equal(normalizeDay('2026-11-30', new Date(2026, 11, 1, 9)), 'yesterday');
});

test('oy to\'ri dushanbadan boshlanadi va 7 ga karrali', () => {
  // 2026-11-01 — yakshanba → oldida 6 bo'sh katak
  const g = monthGrid(new Date(2026, 10, 15));
  assert.equal(g.length % 7, 0);
  assert.equal(g.slice(0, 6).every((x) => x === null), true);
  assert.equal(g[6].getDate(), 1);
  assert.equal(g.filter(Boolean).length, 30);
  // 2026-06-01 — dushanba → bo'sh katak yo'q
  assert.equal(monthGrid(new Date(2026, 5, 1))[0].getDate(), 1);
});

test('sameMonth', () => {
  assert.ok(sameMonth(new Date(2026, 10, 1), new Date(2026, 10, 30)));
  assert.ok(!sameMonth(new Date(2026, 10, 1), new Date(2025, 10, 1)));
});
