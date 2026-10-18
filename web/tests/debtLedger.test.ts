import { describe, it, expect } from 'vitest';
import { allocatePayment, buildLedger } from '@/lib/debtLedger';

describe('allocatePayment', () => {
  const debts = [{ id: 'a', remaining: 1_000 }, { id: 'b', remaining: 500 }, { id: 'c', remaining: 300 }];
  it('eng eski qarzdan boshlab taqsimlaydi', () => {
    expect(allocatePayment(debts, 1_200)).toEqual([{ id: 'a', amount: 1_000 }, { id: 'b', amount: 200 }]);
    expect(allocatePayment(debts, 1_800)).toEqual([{ id: 'a', amount: 1_000 }, { id: 'b', amount: 500 }, { id: 'c', amount: 300 }]);
    expect(allocatePayment(debts, 300)).toEqual([{ id: 'a', amount: 300 }]);
  });
  it("jami qarzdan ko'p, nol yoki kasr — rad etiladi", () => {
    expect(allocatePayment(debts, 1_801)).toBeNull();
    expect(allocatePayment(debts, 0)).toBeNull();
    expect(allocatePayment(debts, 10.5)).toBeNull();
  });
});

describe('buildLedger', () => {
  it("sana tartibida o'suvchi qoldiq; yakuniy qoldiq = sotuv − to'lov", () => {
    const res = buildLedger([
      { id: '1', saleNo: 'S-1', product: 'Telefon', createdAt: new Date('2026-10-01T10:00:00'), totalAmount: 1_000,
        payments: [{ amount: 200, paidAt: new Date('2026-10-01T10:00:00') }, { amount: 300, paidAt: new Date('2026-10-10T09:00:00') }] },
      { id: '2', saleNo: 'S-2', product: 'Quloqchin', createdAt: new Date('2026-10-05T12:00:00'), totalAmount: 400, payments: [] },
    ]);
    expect(res.rows.map((r) => [r.kind, r.saleNo, r.balance])).toEqual([
      ['sale', 'S-1', 1_000], ['payment', 'S-1', 800], ['sale', 'S-2', 1_200], ['payment', 'S-1', 900],
    ]);
    expect(res).toMatchObject({ debit: 1_400, credit: 500, balance: 900 });
  });
});
