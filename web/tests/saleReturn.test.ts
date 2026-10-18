import { describe, it, expect } from 'vitest';
import { computePartialReturn, type ReturnCalcInput } from '@/lib/saleReturn';
import { extractKassaPayments } from '@/lib/kassa';
import { sumCashFromSales } from '@/lib/cashKassa';
import type { ISale } from '@/lib/models/tenant/Sale';

function input(over: Partial<ReturnCalcInput> = {}): ReturnCalcInput {
  return { qty: 5, totalAmount: 500_000, paidAmount: 500_000, remainingAmount: 0, paymentType: 'cash', status: 'paid', ...over };
}

describe('computePartialReturn', () => {
  it("naqd sotuv: qaytgan qiymat to'liq naqd qaytariladi", () => {
    const r = computePartialReturn(input(), 2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.calc).toMatchObject({
      amount: 200_000, debtReduced: 0, refundAmount: 200_000,
      newQty: 3, newTotal: 300_000, newPaid: 300_000, newRemaining: 0, newStatus: 'paid',
    });
  });

  it('qarzli sotuv: avval qarz kamayadi, naqd qaytmaydi', () => {
    const r = computePartialReturn(input({ paymentType: 'debt', paidAmount: 100_000, remainingAmount: 400_000, status: 'partial' }), 1);
    if (!r.ok) throw new Error(r.error);
    expect(r.calc).toMatchObject({ amount: 100_000, debtReduced: 100_000, refundAmount: 0, newTotal: 400_000, newPaid: 100_000, newRemaining: 300_000, newStatus: 'partial' });
  });

  it("qarz qiymatdan kam bo'lsa — qarz yopiladi, qolgani naqd qaytadi", () => {
    const r = computePartialReturn(input({ paymentType: 'debt', paidAmount: 450_000, remainingAmount: 50_000, status: 'partial' }), 2);
    if (!r.ok) throw new Error(r.error);
    expect(r.calc).toMatchObject({ amount: 200_000, debtReduced: 50_000, refundAmount: 150_000, newTotal: 300_000, newPaid: 300_000, newRemaining: 0, newStatus: 'paid' });
  });

  it('yaxlitlash: 3 donaga 1000 so\'m', () => {
    const r = computePartialReturn(input({ qty: 3, totalAmount: 1000, paidAmount: 1000 }), 1);
    if (!r.ok) throw new Error(r.error);
    expect(r.calc.amount).toBe(333);
    expect(r.calc.newTotal).toBe(667);
  });

  it('cheklovlar', () => {
    expect(computePartialReturn(input(), 5)).toEqual({ ok: false, error: 'useCancel' });
    expect(computePartialReturn(input(), 0)).toEqual({ ok: false, error: 'badQty' });
    expect(computePartialReturn(input(), 1.5)).toEqual({ ok: false, error: 'badQty' });
    expect(computePartialReturn(input({ status: 'cancelled' }), 1)).toEqual({ ok: false, error: 'cancelled' });
    expect(computePartialReturn(input({ paymentType: 'bank_credit' }), 1)).toEqual({ ok: false, error: 'bankCredit' });
  });
});

describe('kassa: qaytarilgan naqd pul', () => {
  const day = new Date('2026-10-18T00:00:00');
  const next = new Date('2026-10-19T00:00:00');
  const sale = {
    _id: 's1', saleNo: 'S1', status: 'paid', paymentType: 'cash', branchId: 'b1',
    productSnapshot: { name: 'Kabel', imei: 'K1', saleQuantity: 3 },
    payments: [{ amount: 500_000, paidAt: new Date('2026-10-18T10:00:00') }],
    returns: [{ qty: 2, amount: 200_000, debtReduced: 0, refundAmount: 200_000, returnedAt: new Date('2026-10-18T12:00:00'), by: 'ali' }],
  } as unknown as ISale & { _id: unknown };

  it('kunlik kassada manfiy qator', () => {
    const rows = extractKassaPayments([sale], day, next);
    expect(rows).toHaveLength(2);
    const refund = rows.find((r) => r.isRefund);
    expect(refund?.amount).toBe(-200_000);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(300_000);
  });

  it('filial naqd qoldig\'idan ayriladi', () => {
    expect(sumCashFromSales([sale]).get('b1')).toBe(300_000);
  });
});
