/**
 * Bron sof qoidalari (lib/restaurant/reservationRules.ts) — bazasiz: Toshkent vaqti, 15 daqiqa qadam, ustma-ust,
 * bo'sh stollar tartibi, holat amallari, eslatma oynasi, telefon.
 */
import { describe, it, expect } from 'vitest';
import {
  addDays, dayRange, groupByHour, isDueForReminder, isLate, isValidDuration, noShowTooEarly, normalizeReservationPhone,
  overlaps, parseTime, reservationAllows, reservationEnd, reservationStart, seatTooEarly, sortTablesForGuests, startProblem,
  tashkentClock, tashkentDay,
} from '@/lib/restaurant/reservationRules';

const min = (n: number) => n * 60_000;

describe('vaqt (Toshkent, UTC+5)', () => {
  it('kun + vaqt → lahza; server vaqt zonasidan mustaqil', () => {
    const s = reservationStart('2026-11-21', '19:30')!;
    expect(s.toISOString()).toBe('2026-11-21T14:30:00.000Z');
    expect(tashkentClock(s)).toBe('19:30');
    expect(tashkentDay(s)).toBe('2026-11-21');
    // 00:30 Toshkent — UTC bo'yicha oldingi kun, lekin Toshkent kuni o'zi
    const night = reservationStart('2026-11-21', '00:30')!;
    expect(night.toISOString()).toBe('2026-11-20T19:30:00.000Z');
    expect(tashkentDay(night)).toBe('2026-11-21');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(dayRange('2026-11-21').start.toISOString()).toBe('2026-11-20T19:00:00.000Z');
  });

  it('15 daqiqa qadam, noto\'g\'ri vaqt/sana — null', () => {
    expect(parseTime('09:45')).toBe(585);
    expect(parseTime('9:15')).toBe(555);
    expect(parseTime('19:10')).toBeNull();
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('1900')).toBeNull();
    expect(parseTime({ $gt: '' })).toBeNull();
    expect(reservationStart('2026-02-30', '19:00')).toBeNull();
    expect(reservationStart('2026-11-21', '19:05')).toBeNull();
  });

  it('davomiylik: 30–480 daqiqa, 15 qadam', () => {
    expect(isValidDuration(120)).toBe(true);
    expect(isValidDuration(15)).toBe(false);
    expect(isValidDuration(500)).toBe(false);
    expect(isValidDuration(100)).toBe(false);
    expect(isValidDuration('120')).toBe(false);
  });
});

describe('qoidalar', () => {
  const s = reservationStart('2026-11-21', '19:00')!;
  const e = reservationEnd(s, 120);

  it('ustma-ust: kesishgan — ha, tutashgan — yo\'q', () => {
    expect(overlaps(s, e, reservationStart('2026-11-21', '20:30')!, reservationStart('2026-11-21', '22:00')!)).toBe(true);
    expect(overlaps(s, e, reservationStart('2026-11-21', '18:00')!, reservationStart('2026-11-21', '19:15')!)).toBe(true);
    expect(overlaps(s, e, reservationStart('2026-11-21', '21:00')!, reservationStart('2026-11-21', '23:00')!)).toBe(false);
    expect(overlaps(s, e, reservationStart('2026-11-21', '17:00')!, s)).toBe(false);
  });

  it('o\'tgan vaqt (15 daqiqa chegara) va bir yildan uzoq — rad', () => {
    expect(startProblem(s, new Date(s.getTime() + min(10)))).toBeNull();
    expect(startProblem(s, new Date(s.getTime() + min(20)))).toBe('past');
    expect(startProblem(new Date(s.getTime() + 400 * 86_400_000), s)).toBe('tooFar');
  });

  it('holat amallari: faqat booked; «Keldi» — 3 soat oldindan, «Kelmadi» — vaqti kelgach', () => {
    expect(reservationAllows('booked', 'seat')).toBe(true);
    for (const st of ['seated', 'cancelled', 'no_show'] as const) expect(reservationAllows(st, 'cancel')).toBe(false);
    expect(seatTooEarly(s, new Date(s.getTime() - min(181)))).toBe(true);
    expect(seatTooEarly(s, new Date(s.getTime() - min(180)))).toBe(false);
    expect(noShowTooEarly(s, new Date(s.getTime() - 1))).toBe(true);
    expect(noShowTooEarly(s, s)).toBe(false);
    expect(isLate({ status: 'booked', startAt: s }, new Date(s.getTime() + min(16)))).toBe(true);
    expect(isLate({ status: 'seated', startAt: s }, new Date(s.getTime() + min(60)))).toBe(false);
  });

  it('eslatma oynasi: ≤ 30 daq qolgan yoki ≤ 10 daq o\'tgan, eslatilmagan booked', () => {
    const r = { status: 'booked' as const, startAt: s, remindedAt: null };
    expect(isDueForReminder(r, new Date(s.getTime() - min(30)))).toBe(true);
    expect(isDueForReminder(r, new Date(s.getTime() - min(31)))).toBe(false);
    expect(isDueForReminder(r, new Date(s.getTime() + min(10)))).toBe(true);
    expect(isDueForReminder(r, new Date(s.getTime() + min(11)))).toBe(false);
    expect(isDueForReminder({ ...r, remindedAt: s }, s)).toBe(false);
    expect(isDueForReminder({ ...r, status: 'cancelled' }, s)).toBe(false);
  });

  it('bo\'sh stollar: sig\'adiganlar (kichigi oldin), keyin sig\'maydiganlar (kattasi oldin)', () => {
    const list = [{ number: 1, seats: 2 }, { number: 2, seats: 8 }, { number: 3, seats: 4 }, { number: 4, seats: 4 }, { number: 5, seats: 3 }];
    expect(sortTablesForGuests(list, 4).map((t) => [t.number, t.fits])).toEqual([[3, true], [4, true], [2, true], [5, false], [1, false]]);
  });

  it('soat bo\'yicha guruh', () => {
    expect(groupByHour([{ time: '18:00' }, { time: '18:45' }, { time: '20:15' }]).map((g) => [g.hour, g.items.length])).toEqual([['18:00', 2], ['20:00', 1]]);
  });

  it('telefon: O\'zbekiston — to\'liq 9 raqam (bir ko\'rinishga), xorijiy — «+» bilan; qolgani rad', () => {
    expect(normalizeReservationPhone('901234567')).toBe('+998 90 123 45 67');
    expect(normalizeReservationPhone('+998901234567')).toBe('+998 90 123 45 67');
    expect(normalizeReservationPhone('+7 916 123-45-67')).toBe('+7 916 123-45-67');
    expect(normalizeReservationPhone('12345')).toBeNull();
    expect(normalizeReservationPhone('+998 90 12')).toBeNull();
    expect(normalizeReservationPhone('')).toBeNull();
    expect(normalizeReservationPhone('+1 <script>')).toBeNull();
  });
});
