import { describe, expect, it } from 'vitest';
import { dailySummaryText, shiftDiffText, shiftDiffPush, dailySummaryPush, newSalePush, salePayLabel } from '@/lib/shopNotify';

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

describe('push matnlari', () => {
  it("smena farqi — HTML'siz, smenalar ekraniga", () => {
    const p = shiftDiffPush({ shiftNo: 'K-0003', branch: 'Markaziy', by: 'demo', expected: 500000, counted: 480000, difference: -20000 });
    expect(p.title).toMatch(/K-0003: kamomad 20.000 so'm/);
    expect(p.body).toContain('Markaziy · demo');
    expect(p.title + p.body).not.toMatch(/<\/?b>/);
    expect(p.url).toBe('/shifts');
  });
  it("kunlik yakun — bo'sh qatorlarsiz", () => {
    const p = dailySummaryPush('Savora Demo', { count: 4, total: 100, newDebt: 0, expenses: 0, openShifts: 1 });
    expect(p.title).toBe('Savora Demo — kun yakuni');
    expect(p.body).toContain('4 ta');
    expect(p.body).not.toContain('Xarajatlar');
    expect(p.body).toContain('Yopilmagan smena: 1');
  });
  it('yangi sotuv — bir nechta mahsulot va chek raqamisiz', () => {
    const one = newSalePush({ saleNo: 'S-0012', items: 1, firstItem: 'iPhone 13', total: 7500000, payment: 'Naqd', by: 'ali' });
    expect(one.title).toMatch(/Yangi sotuv · 7.500.000 so'm/);
    expect(one.body).toBe('S-0012 · iPhone 13\nNaqd · ali');
    const many = newSalePush({ items: 3, firstItem: 'Non', total: 9000, payment: 'Click', by: 'ali' });
    expect(many.body.startsWith('Non va yana 2 ta')).toBe(true);
  });
});

describe('salePayLabel', () => {
  it("qarz/nasiya — turi, to'liq to'lov — usuli", () => {
    expect(salePayLabel('debt', ['cash'])).toBe('Qarz');
    expect(salePayLabel('installment')).toContain('Nasiya');
    expect(salePayLabel('cash')).toBe('Naqd');
    expect(salePayLabel('cash', ['payme'])).toBe('Payme');
    expect(salePayLabel('cash', ['cash', 'uzcard'])).toBe("Aralash to'lov");
  });
});
