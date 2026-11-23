import { describe, it, expect } from 'vitest';
import { IN_KINDS, OUT_KINDS, scopeMoneyRows, sumByKind } from '@/lib/dayFlow';
import { moneyRowsFromFlows, moneyRowsFromReceipts, moneyRowsFromSales, sumMoney, type MoneyRow } from '@/lib/realization';

const A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const start = new Date(2026, 10, 22);
const end = new Date(2026, 10, 23);
const at = (h: number) => new Date(2026, 10, 22, h);

function rows(): MoneyRow[] {
  const sales = moneyRowsFromSales([
    {
      _id: 's1', branchId: A, saleNo: 'S-1', status: 'paid', paymentType: 'cash', totalAmount: 500_000, createdAt: at(10),
      payments: [{ amount: 500_000, paidAt: at(10), method: 'cash' }],
      returns: [{ qty: 1, amount: 100_000, debtReduced: 0, refundAmount: 100_000, returnedAt: at(15), by: 'k' }],
      productSnapshot: { name: 'Telefon' }, customerSnapshot: { fullName: 'Ali' },
    },
    {
      // Kechagi nasiya sotuvi — bugungi to'lov «qarz/nasiya to'lovi»
      _id: 's2', branchId: B, saleNo: 'S-2', status: 'partial', paymentType: 'installment', totalAmount: 900_000, createdAt: new Date(2026, 10, 1),
      payments: [{ amount: 300_000, paidAt: at(11), method: 'uzcard' }],
      returns: [], productSnapshot: { name: 'Muzlatkich' }, customerSnapshot: { fullName: 'Vali' },
    },
  ] as never, start, end);
  const flows = moneyRowsFromFlows([
    { _id: 'f1', type: 'expense', amount: 50_000, description: 'Ijara', category: 'Ijara', createdAt: at(12), branchId: A },
    { _id: 'f2', type: 'expense', amount: 70_000, description: 'Soliq', createdAt: at(13) },
    { _id: 'f3', type: 'income', amount: 20_000, description: 'Kassaga qo\'shildi', createdAt: at(9), branchId: B },
    // Boshqa kun — kirmaydi
    { _id: 'f4', type: 'income', amount: 999, description: 'Kecha', createdAt: new Date(2026, 10, 21, 12) },
  ], start, end);
  const bank = moneyRowsFromReceipts([{ bankName: 'Ishonch', amount: 400_000, receivedAt: at(14), branchId: A }], start, end);
  return [...sales, ...flows, ...bank];
}

describe('kunlik kirim-chiqim', () => {
  it('egasi — barcha filiallar va filialsiz yozuvlar', () => {
    const all = scopeMoneyRows(rows(), null);
    expect(all).toHaveLength(7);
    expect(sumMoney(all)).toEqual({ in: 1_220_000, out: 220_000, net: 1_000_000 });
    const k = sumByKind(all);
    expect(k).toMatchObject({ salePay: 500_000, debtPay: 300_000, bank: 400_000, income: 20_000, expense: 120_000, refund: 100_000, supplier: 0 });
  });

  it("filial login — faqat o'z filiali; filialsiz xarajat ko'rinmaydi", () => {
    const a = scopeMoneyRows(rows(), A);
    expect(a.every((r) => r.branchId === A)).toBe(true);
    expect(sumMoney(a)).toEqual({ in: 900_000, out: 150_000, net: 750_000 });
    expect(sumByKind(scopeMoneyRows(rows(), B))).toMatchObject({ debtPay: 300_000, income: 20_000, expense: 0 });
  });

  it("kirim va chiqim turlari kesishmaydi va hamma turni qamraydi", () => {
    const kinds = Object.keys(sumByKind([]));
    expect([...IN_KINDS, ...OUT_KINDS].sort()).toEqual(kinds.sort());
  });
});
