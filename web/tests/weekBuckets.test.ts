import { describe, it, expect } from 'vitest';
import { dayBoundaries, toDayPoints, smoothPath } from '@/lib/weekBuckets';

describe('weekBuckets', () => {
  it('7 kun uchun 8 ta chegara, oxirgisi ertangi kun boshi', () => {
    const b = dayBoundaries(new Date(2026, 9, 15, 14, 30), 7);
    expect(b).toHaveLength(8);
    expect(b[0]).toEqual(new Date(2026, 9, 9));
    expect(b[6]).toEqual(new Date(2026, 9, 15));
    expect(b[7]).toEqual(new Date(2026, 9, 16));
  });

  it("oy chegarasidan o'tadi", () => {
    const b = dayBoundaries(new Date(2026, 10, 2, 9), 7);
    expect(b[0]).toEqual(new Date(2026, 9, 27));
  });

  it("bo'sh kunlar 0, mavjudlari o'z joyiga tushadi", () => {
    const b = dayBoundaries(new Date(2026, 9, 15, 10), 7);
    const pts = toDayPoints(b, [{ _id: b[6], total: 500, count: 2 }, { _id: 'other', total: 9 }]);
    expect(pts).toHaveLength(7);
    expect(pts[6]).toMatchObject({ total: 500, count: 2, date: '15.10', label: 'Pa' });
    expect(pts[0].total).toBe(0);
  });

  it('smoothPath — M bilan boshlanadi, har segment C', () => {
    const d = smoothPath([[0, 0], [10, 5], [20, 0]]);
    expect(d.startsWith('M0.0,0.0')).toBe(true);
    expect(d.match(/C/g)).toHaveLength(2);
    expect(smoothPath([])).toBe('');
  });
});
