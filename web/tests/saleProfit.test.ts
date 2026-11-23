import { describe, it, expect } from 'vitest';
import { defersProfit, profitBetween, profitToDate, saleProfitParts } from '@/lib/saleProfit';
import { profitReport } from '@/lib/monitoring';
import { earlierNasiyaProfit, soldRows } from '@/lib/realization';
import { lineFromSale } from '@/lib/inventoryFlow';

const day = (m: number, d: number) => new Date(2026, m - 1, d, 12);
const month = (m: number) => ({ start: new Date(2026, m - 1, 1), end: new Date(2026, m, 1) });

/** 10 mln telefon, tannarx 7 mln, boshlang'ich 2 mln (sentabr), keyin oyiga 1 mln (oktabr–may) */
function nasiya(paidMonths: number) {
  const payments = [{ amount: 2_000_000, paidAt: day(9, 10), note: "Boshlang'ich to'lov" }];
  for (let i = 1; i <= paidMonths; i++) payments.push({ amount: 1_000_000, paidAt: new Date(2026, 8 + i, 10, 12), note: '' });
  const paid = payments.reduce((a, p) => a + p.amount, 0);
  return {
    _id: 'n1', branchId: 'b1', saleNo: 'S-1', status: (paid >= 10_000_000 ? 'paid' : 'partial') as 'paid' | 'partial', paymentType: 'installment' as const,
    totalAmount: 10_000_000, paidAmount: paid, remainingAmount: 10_000_000 - paid, createdAt: day(9, 10),
    payments, returns: [], productSnapshot: { name: 'Telefon', imei: '1', purchasePrice: 7_000_000, saleQuantity: 1 },
    customerSnapshot: { fullName: 'Ali', phone: '' },
  };
}

describe('nasiya foydasi — avval tannarx qoplanadi', () => {
  it('faqat nasiya kechiktiriladi', () => {
    expect(defersProfit({ paymentType: 'installment' })).toBe(true);
    expect(defersProfit({ paymentType: 'cash' })).toBe(false);
    expect(defersProfit({ paymentType: 'debt' })).toBe(false);
    expect(defersProfit({ paymentType: 'bank_credit' })).toBe(false);
  });

  it('oddiy sotuv — foyda sotuv kuni to\'liq', () => {
    const parts = saleProfitParts({ paymentType: 'cash', totalAmount: 1_000_000, createdAt: day(9, 1) }, 600_000);
    expect(parts).toEqual([{ at: day(9, 1), amount: 400_000, kind: 'sale' }]);
  });

  it('tannarx qoplanguncha 0, keyin har oylik to\'lov foydaga', () => {
    const s = nasiya(8);
    const parts = saleProfitParts(s, 7_000_000);
    // 2 + 5×1 = 7 mln — 5-oy (fevral) oxirigacha foyda yo'q
    expect(profitBetween(parts, month(9).start, new Date(2027, 2, 1))).toBe(0);
    expect(profitBetween(parts, new Date(2027, 2, 1), new Date(2027, 3, 1))).toBe(1_000_000); // mart
    expect(parts.every((p) => p.kind === 'nasiya')).toBe(true);
    expect(profitToDate(parts)).toBe(3_000_000); // to'liq to'langach = 10 − 7
  });

  it('qisman to\'lov tannarx chegarasini kesib o\'tsa — faqat oshgan qismi', () => {
    const parts = saleProfitParts({
      paymentType: 'installment', totalAmount: 1_000_000, createdAt: day(9, 1),
      payments: [{ amount: 300_000, paidAt: day(9, 1) }, { amount: 500_000, paidAt: day(10, 1) }],
    }, 600_000);
    expect(parts).toEqual([{ at: day(10, 1), amount: 200_000, kind: 'nasiya' }]);
  });

  it('zararli nasiya — zarar sotuv kuni, to\'lovlar foyda bermaydi', () => {
    const parts = saleProfitParts({
      paymentType: 'installment', totalAmount: 800_000, createdAt: day(9, 1),
      payments: [{ amount: 800_000, paidAt: day(11, 1) }],
    }, 1_000_000);
    expect(parts).toEqual([{ at: day(9, 1), amount: -200_000, kind: 'sale' }]);
  });

  it('bank + nasiya: tannarx faqat mijoz qismi to\'lovlari bilan solishtiriladi, bank ulushi alohida', () => {
    // 10 mln, bank 3 mln, mijoz 7 mln; tannarx 6 mln — mijoz 7 mln to'lasa foyda 1 mln (+ bank pul olinganda 3 mln)
    const parts = saleProfitParts({
      paymentType: 'installment', totalAmount: 10_000_000, bankParts: [{ bankName: 'Ishonch', amount: 3_000_000 }], createdAt: day(9, 1),
      payments: [{ amount: 6_500_000, paidAt: day(9, 1) }, { amount: 500_000, paidAt: day(10, 1) }],
    }, 6_000_000);
    expect(parts).toEqual([
      { at: day(9, 1), amount: 500_000, kind: 'nasiya' },
      { at: day(10, 1), amount: 500_000, kind: 'nasiya' },
    ]);
  });

  it('mijozga qaytarilgan naqd to\'langan summani kamaytiradi', () => {
    const parts = saleProfitParts({
      paymentType: 'installment', totalAmount: 900_000, createdAt: day(9, 1),
      payments: [{ amount: 900_000, paidAt: day(9, 1) }],
      returns: [{ refundAmount: 100_000, returnedAt: day(9, 5) }],
    }, 600_000);
    expect(profitToDate(parts)).toBe(200_000);
  });
});

describe('nasiya foydasi hisobotlarda', () => {
  const branches = [{ id: 'b1', name: 'Chilonzor' }];

  it('profitReport: sotuv oyida kutiladi, to\'lov oyida kiradi; zinapoya yig\'indisi yalpiga teng', () => {
    const s = nasiya(8);
    const cost = 7_000_000;
    const line = { branchId: 'b1', revenue: 10_000_000, cost, at: s.createdAt, parts: saleProfitParts(s, cost) };
    const cash = { branchId: 'b1', revenue: 500_000, cost: 300_000, at: day(9, 20) };

    const sep = profitReport({ lines: [line, cash], flows: [], categories: [], branches, ...month(9) });
    expect(sep.revenue).toBe(10_500_000);
    expect(sep.nasiyaDeferred).toBe(3_000_000);
    expect(sep.nasiyaRecognized).toBe(0);
    expect(sep.gross).toBe(200_000);
    expect(sep.revenue - sep.cost - sep.nasiyaDeferred + sep.nasiyaRecognized).toBe(sep.gross);
    expect(sep.daily.reduce((a, d) => a + d.gross, 0)).toBe(sep.gross);

    // Mart 2027: sotuv yo'q, nasiya to'lovidan +1 mln (oldin sotilgan)
    const mar = profitReport({ lines: [line], flows: [], categories: [], branches, start: new Date(2027, 2, 1), end: new Date(2027, 3, 1) });
    expect(mar.revenue).toBe(0);
    expect(mar.nasiyaRecognized).toBe(1_000_000);
    expect(mar.gross).toBe(1_000_000);
    expect(mar.byBranch[0].gross).toBe(1_000_000);
  });

  it('realizatsiya: sotilgan qator foydasi davrda kirgani, oldingi nasiyalar alohida', () => {
    const s = nasiya(8);
    const [row] = soldRows([s as never], month(9).start, month(9).end);
    expect(row.profit).toBe(0);
    expect(earlierNasiyaProfit([s as never], new Date(2027, 3, 1), new Date(2027, 4, 1))).toBe(1_000_000); // aprel
    expect(earlierNasiyaProfit([s as never], month(9).start, month(9).end)).toBe(0); // sotuv oyi — soldRows da
  });

  it('kirim-chiqim qatori: hozirgacha tannarxdan oshib to\'langani', () => {
    const line = lineFromSale(nasiya(6) as never, 'Chilonzor'); // 2 + 6 = 8 mln to'langan
    expect(line.profit).toBe(1_000_000);
  });
});
