import { describe, it, expect } from 'vitest';
import { checkPq294, mayBeOperator, PQ294_MAX_AMOUNT } from '@/lib/pq294';

describe('PQ-294 chegaralari', () => {
  it('12 oy, yillik 30% ustama — mos', () => {
    // 10 mln, 12 oy, jami 13 mln → yiliga 30%
    const r = checkPq294({ price: 10_000_000, totalWithMarkup: 13_000_000, months: 12 });
    expect(r.ok).toBe(true);
    expect(r.extraPctYear).toBe(30);
  });

  it('18 oy — muddat chegarasidan oshadi', () => {
    const r = checkPq294({ price: 5_000_000, totalWithMarkup: 5_500_000, months: 18 });
    expect(r.issues).toContain('months');
  });

  it('6 oyga 30% ustama yillik 60% ga teng — chegaradan oshadi', () => {
    const r = checkPq294({ price: 10_000_000, totalWithMarkup: 13_000_000, months: 6 });
    expect(r.extraPctYear).toBe(60);
    expect(r.issues).toContain('extra');
  });

  it('250 BHM dan qimmat xarid', () => {
    const r = checkPq294({ price: PQ294_MAX_AMOUNT + 1, totalWithMarkup: PQ294_MAX_AMOUNT + 1, months: 3 });
    expect(r.issues).toEqual(['amount']);
  });

  it('operator chegarasi: 500 mln dan oshgan va ulush ≥50%', () => {
    expect(mayBeOperator(600_000_000, 300_000_000)).toBe(true);
    expect(mayBeOperator(600_000_000, 200_000_000)).toBe(false);
    expect(mayBeOperator(400_000_000, 400_000_000)).toBe(false);
  });
});

import { pq294InForce, pq294MonthsError } from '@/lib/pq294';
import { describe as d2, it as i2, expect as e2 } from 'vitest';

d2('pq294MonthsError', () => {
  i2('2027 dan oldin uzun muddat ruxsat etiladi', () => {
    e2(pq294MonthsError(24, new Date('2026-12-31T12:00:00+05:00'))).toBeNull();
  });
  i2('2027-01-01 dan 12 oydan uzun nasiya rad etiladi', () => {
    e2(pq294InForce(new Date('2027-01-01T00:00:00+05:00'))).toBe(true);
    e2(pq294MonthsError(13, new Date('2027-01-01T09:00:00+05:00'))).toMatch(/12 oydan/);
    e2(pq294MonthsError(12, new Date('2027-06-01T09:00:00+05:00'))).toBeNull();
  });
});
