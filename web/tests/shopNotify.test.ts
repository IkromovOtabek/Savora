import { describe, expect, it } from 'vitest';
import { dailySummaryText, shiftDiffText } from '@/lib/shopNotify';

describe('shiftDiffText', () => {
  it('kamomad va HTML ekranlash', () => {
    const t = shiftDiffText({ shop: 'A&B', shiftNo: 'K-0003', branch: 'Markaziy', by: 'demo', expected: 500000, counted: 480000, difference: -20000 });
    expect(t).toContain('A&amp;B');
    expect(t).toContain('Kamomad');
    expect(t).toMatch(/20.000 so'm/);
  });
  it('ortiqcha', () => {
    expect(shiftDiffText({ shop: 'S', shiftNo: 'K-1', branch: 'B', by: 'u', expected: 1, counted: 2, difference: 1 })).toContain('Ortiqcha');
  });
});

describe('dailySummaryText', () => {
  it("bo'sh qatorlar chiqmaydi", () => {
    const t = dailySummaryText('Savora Demo', new Date('2026-10-19T12:00:00'), { count: 4, total: 24482500, newDebt: 0, expenses: 0, openShifts: 0 });
    expect(t).toContain('4 ta');
    expect(t).not.toContain('Xarajatlar');
    expect(t).not.toContain('smena');
  });
  it('qarz, xarajat va ochiq smena', () => {
    const t = dailySummaryText('S', new Date(), { count: 1, total: 100, newDebt: 50, expenses: 30, openShifts: 1 });
    expect(t).toContain('Qarzga');
    expect(t).toContain('Xarajatlar');
    expect(t).toContain('Yopilmagan smena: 1');
  });
});
