import { describe, it, expect } from 'vitest';
import { isDayPeriod, parsePeriod, periodLabel, periodRange } from '@/lib/period';

const now = new Date('2026-10-19T14:30:00');
const day = (s: string) => new Date(`${s}T00:00:00`);

describe('period', () => {
  it("noma'lum qiymat — sukut (bugun)", () => {
    expect(parsePeriod('week')).toBe('week');
    expect(parsePeriod('nope')).toBe('today');
    expect(parsePeriod(undefined, 'month')).toBe('month');
  });

  it('chegaralar [start, end)', () => {
    expect(periodRange('today', now)).toEqual({ start: day('2026-10-19'), end: day('2026-10-20') });
    expect(periodRange('yesterday', now)).toEqual({ start: day('2026-10-18'), end: day('2026-10-19') });
    expect(periodRange('week', now)).toEqual({ start: day('2026-10-13'), end: day('2026-10-20') });
    expect(periodRange('month', now)).toEqual({ start: day('2026-09-20'), end: day('2026-10-20') });
    expect(periodRange('year', now).start).toEqual(day('2025-10-20'));
  });

  it("«Hammasi» — cheklovsiz, ertagacha", () => {
    expect(parsePeriod('all')).toBe('all');
    expect(periodRange('all', now)).toEqual({ start: new Date(0), end: day('2026-10-20') });
  });

  it('aniq kun — ?p=YYYY-MM-DD, faqat haqiqiy sana', () => {
    expect(parsePeriod('2026-10-05')).toBe('2026-10-05');
    expect(periodRange('2026-10-05', now)).toEqual({ start: day('2026-10-05'), end: day('2026-10-06') });
    expect(periodRange('2026-10-31', now)).toEqual({ start: day('2026-10-31'), end: day('2026-11-01') });
    expect(isDayPeriod('2026-02-31')).toBe(false);
    expect(isDayPeriod('1999-01-01')).toBe(false);
    expect(parsePeriod('2026-13-01', 'month')).toBe('month');
  });

  it('yorliq: preset — lug\'atdan, kun — formatlangan', () => {
    const labels = { all: 'Hammasi', yesterday: 'Kecha', today: 'Bugun', week: 'Hafta', month: 'Oy', year: 'Yil' };
    expect(periodLabel('week', labels, () => 'x')).toBe('Hafta');
    expect(periodLabel('2026-10-05', labels, (d) => String(d.getDate()))).toBe('5');
  });
});
