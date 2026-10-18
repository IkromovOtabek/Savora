import { describe, it, expect } from 'vitest';
import { runWithCompensation } from '@/lib/compensate';

describe('runWithCompensation', () => {
  it('hammasi muvaffaqiyatli — natijalar tartibda, hech narsa bekor qilinmaydi', async () => {
    const undone: number[] = [];
    const res = await runWithCompensation([1, 2, 3], async (n) => ({ result: n * 10, undo: async () => { undone.push(n); } }));
    expect(res).toEqual({ ok: true, results: [10, 20, 30] });
    expect(undone).toEqual([]);
  });

  it("3-qadam null qaytarsa — 1 va 2 teskari tartibda bekor qilinadi", async () => {
    const undone: number[] = [];
    const res = await runWithCompensation([1, 2, 3, 4], async (n) => (n === 3 ? null : { result: n, undo: async () => { undone.push(n); } }));
    expect(res).toEqual({ ok: false, failedIndex: 2, error: undefined });
    expect(undone).toEqual([2, 1]);
  });

  it('xato tashlansa ham bekor qilinadi va xato qaytariladi', async () => {
    const undone: number[] = [];
    const boom = new Error('db');
    const res = await runWithCompensation([1, 2], async (n) => {
      if (n === 2) throw boom;
      return { result: n, undo: async () => { undone.push(n); } };
    });
    expect(res).toEqual({ ok: false, failedIndex: 1, error: boom });
    expect(undone).toEqual([1]);
  });

  it("bitta undo xato bersa ham qolganlari bajariladi", async () => {
    const undone: number[] = [];
    const res = await runWithCompensation([1, 2, 3], async (n) => (n === 3 ? null : {
      result: n,
      undo: async () => { if (n === 2) throw new Error('undo'); undone.push(n); },
    }));
    expect(res.ok).toBe(false);
    expect(undone).toEqual([1]);
  });
});
