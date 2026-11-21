import { describe, it, expect } from 'vitest';
import { dirtyDelay } from '@/lib/ecom/dirty';

/** Katalog «iflos» belgisi: ketma-ket yozuvlar birlashadi, lekin yig'ish cheksiz kechikmaydi (≤ 15 s) */
describe('dirtyDelay', () => {
  it('birinchi belgi — 2,5 s kutadi', () => {
    expect(dirtyDelay(undefined, 1000)).toBe(2500);
  });
  it('yangi belgi taymerni qayta boshlaydi, chegaraga yaqinlashganda — yo\'q', () => {
    expect(dirtyDelay(0, 5000)).toBe(2500);
    expect(dirtyDelay(0, 12_400)).toBe(2500);
    expect(dirtyDelay(0, 12_500)).toBeNull();
    expect(dirtyDelay(0, 14_000)).toBeNull();
  });
  it('kassa har 1 s da sotsa ham yig\'ish birinchi belgidan ≤ 15 s da ishlaydi', () => {
    let fireAt = 0;
    for (let now = 0; now <= 30_000; now += 1000) {
      if (now >= fireAt && fireAt > 0) break;
      const d = dirtyDelay(0, now);
      if (d !== null) fireAt = now + d;
    }
    expect(fireAt).toBeLessThanOrEqual(15_000);
  });
});
