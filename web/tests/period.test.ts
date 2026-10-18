import { describe, it, expect } from 'vitest';
import { parsePeriod, periodRange } from '@/lib/period';

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
});
