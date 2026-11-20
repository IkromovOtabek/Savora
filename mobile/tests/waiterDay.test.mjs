// Ofitsant kabineti «Mening kunim» (lib/waiterDay.ts) — sof yordamchilar testi.
// Ishga tushirish: `npm test` (Node ≥ 22.18: .ts fayl type stripping bilan to'g'ridan-to'g'ri o'qiladi)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openBadges, tkClock, tkDayClock, rangeLabel, waiterDayPath, WAITER_DAY_PERIODS } from '../lib/waiterDay.ts';

const counts = (over) => ({ items: 3, pending: 0, unsent: 0, active: 3, ready: 0, voided: 0, unpaid: 3, ...over });

test('ochiq stol belgilari: tayyor → QR → yuborilmagan → pre-chek', () => {
  assert.deepEqual(openBadges({ status: 'open', counts: counts({}) }), []);
  assert.deepEqual(
    openBadges({ status: 'precheck', counts: counts({ ready: 2, pending: 1, unsent: 3 }) }).map((b) => [b.kind, b.n]),
    [['ready', 2], ['pending', 1], ['unsent', 3], ['precheck', 0]],
  );
  // Yashirin summa (counts yo'q) — faqat holat
  assert.deepEqual(openBadges({ status: 'precheck', counts: null }), [{ kind: 'precheck', n: 0 }]);
});

test('vaqt — Toshkent (UTC+5), telefon zonasidan qat\'i nazar', () => {
  assert.equal(tkClock('2026-11-20T09:05:00.000Z'), '14:05');
  // UTC 20:30 — Toshkentda ertasi kun 01:30
  assert.equal(tkDayClock('2026-11-19T20:30:00.000Z'), '20.11 01:30');
  assert.equal(tkClock(null), '—');
  assert.equal(tkClock('xato'), '—');
});

test('davr yorlig\'i va so\'rov yo\'li', () => {
  assert.equal(rangeLabel('2026-11-20', '2026-11-20'), '20.11.2026');
  assert.equal(rangeLabel('2026-11-14', '2026-11-20'), '14.11 – 20.11');
  assert.deepEqual([...WAITER_DAY_PERIODS], ['today', 'week', 'month']);
  assert.equal(waiterDayPath('week'), '/api/mobile/restaurant/waiter-day?p=week');
});
