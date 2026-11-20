// Bron vaqti (lib/reservationTime.ts) — sof funksiyalar testi: Toshkent kuni/soati, 15 daqiqa qadam, guruhlash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, canSeatNow, defaultMinutes, fmtDayShort, fmtTime, groupByHour, hasStarted, parseTime, tashkentDay, tashkentMinutes, weekday,
} from '../lib/reservationTime.ts';

test('Toshkent kuni va soati — telefon vaqt zonasidan mustaqil', () => {
  // 2026-11-20 19:30 UTC = 2026-11-21 00:30 Toshkent
  const d = new Date('2026-11-20T19:30:00Z');
  assert.equal(tashkentDay(d), '2026-11-21');
  assert.equal(tashkentMinutes(d), 30);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(fmtDayShort('2026-11-21'), '21.11');
  assert.equal(weekday('2026-11-22'), 0);
});

test('vaqt: 15 daqiqa qadam', () => {
  assert.equal(parseTime('19:45'), 1185);
  assert.equal(parseTime('19:40'), null);
  assert.equal(parseTime('24:00'), null);
  assert.equal(fmtTime(1185), '19:45');
  assert.equal(fmtTime(1440 + 30), '00:30');
});

test('boshlang\'ich vaqt: bugun — keyingi chorak + 30 daq, boshqa kun — 19:00', () => {
  const now = new Date('2026-11-21T07:05:00Z'); // 12:05 Toshkent
  assert.equal(defaultMinutes('2026-11-21', now), 12 * 60 + 15 + 30);
  assert.equal(defaultMinutes('2026-11-22', now), 19 * 60);
  const late = new Date('2026-11-21T18:50:00Z'); // 23:50 Toshkent
  assert.equal(defaultMinutes('2026-11-21', late), 23 * 60 + 45);
});

test('soat bo\'yicha guruh va boshlanganmi', () => {
  const g = groupByHour([{ time: '18:00' }, { time: '18:45' }, { time: '20:15' }]);
  assert.deepEqual(g.map((x) => [x.hour, x.items.length]), [['18:00', 2], ['20:00', 1]]);
  assert.equal(hasStarted('2026-11-21T14:00:00Z', Date.parse('2026-11-21T14:00:00Z')), true);
  assert.equal(hasStarted('2026-11-21T14:00:00Z', Date.parse('2026-11-21T13:59:00Z')), false);
});

test('«Keldi» — boshlanishiga ≤ 3 soat qolganda', () => {
  assert.equal(canSeatNow('2026-11-21T14:00:00Z', Date.parse('2026-11-21T11:00:00Z')), true);
  assert.equal(canSeatNow('2026-11-21T14:00:00Z', Date.parse('2026-11-21T10:59:00Z')), false);
  assert.equal(canSeatNow('2026-11-21T14:00:00Z', Date.parse('2026-11-21T15:00:00Z')), true);
});
