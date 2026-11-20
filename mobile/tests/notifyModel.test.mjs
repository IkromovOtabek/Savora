// Bildirishnomalar (lib/notifyModel.ts) — sof funksiyalar testi: web yo'li → ilova ekrani, push nishoni, «oldin», badge.
// Ishga tushirish: `npm test` (Node ≥ 22.18: .ts fayl type stripping bilan to'g'ridan-to'g'ri o'qiladi)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agoText, badgeText, notifyIconOf, notifyRouteOf, notifyToneOf, pushTargetOf } from '../lib/notifyModel.ts';

test('web yo\'li → ilova ekrani', () => {
  assert.equal(notifyRouteOf('/app/tables'), '/tables');
  assert.equal(notifyRouteOf('/app/tables/64a000000000000000000001'), '/tables');
  assert.equal(notifyRouteOf('/app/products?low=1'), '/(tabs)/products');
  assert.equal(notifyRouteOf('/app/menu'), '/(tabs)/products');
  assert.equal(notifyRouteOf('/app/restaurant/reservations'), null);
  assert.equal(notifyRouteOf('/app/tablesX'), null);
  assert.equal(notifyRouteOf(null), null);
  assert.equal(notifyRouteOf(undefined), null);
});

test('push nishoni: ilova ichidagi yo\'l — ekran yoki ro\'yxat; tashqi — yo\'q', () => {
  assert.equal(pushTargetOf('/app/tables'), '/tables');
  assert.equal(pushTargetOf('/app/restaurant/reservations'), '/notifications');
  assert.equal(pushTargetOf('/app'), '/notifications');
  assert.equal(pushTargetOf('/'), null);
  assert.equal(pushTargetOf('https://evil.example/app/tables'), null);
  assert.equal(pushTargetOf('/application'), null);
});

test('«oldin» (server soatiga moslangan)', () => {
  const t = { justNow: 'Hozirgina', minutesAgo: '{n} daqiqa oldin', hoursAgo: '{n} soat oldin', daysAgo: '{n} kun oldin' };
  const now = Date.parse('2026-11-20T12:00:00Z');
  assert.equal(agoText(t, '2026-11-20T11:59:10Z', now), 'Hozirgina');
  assert.equal(agoText(t, '2026-11-20T11:55:00Z', now), '5 daqiqa oldin');
  assert.equal(agoText(t, '2026-11-20T10:00:00Z', now), '2 soat oldin');
  assert.equal(agoText(t, '2026-11-17T12:00:00Z', now), '3 kun oldin');
  assert.equal(agoText(t, '2026-11-20T12:03:00Z', now), 'Hozirgina');
});

test('ohang, ikonka va badge', () => {
  assert.equal(notifyToneOf('waiterCall'), 'call');
  assert.equal(notifyToneOf('billCall'), 'call');
  assert.equal(notifyToneOf('dishLow'), 'stock');
  assert.equal(notifyToneOf('reservationSoon'), 'info');
  assert.equal(notifyIconOf('lowStock'), 'cube');
  assert.equal(notifyIconOf('nomalum'), 'notifications');
  assert.equal(badgeText(0), null);
  assert.equal(badgeText(7), '7');
  assert.equal(badgeText(120), '99+');
});
