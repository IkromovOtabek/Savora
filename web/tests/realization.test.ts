import { describe, it, expect } from 'vitest';
import { buildXlsx, colName, crc32, escapeXml } from '@/lib/xlsxWrite';
import { readXlsx } from '@/lib/xlsxRead';
import { moneyRowsFromFlows, moneyRowsFromReceipts, moneyRowsFromSales, moneyRowsFromSupplier, soldRows, sumMoney } from '@/lib/realization';

const start = new Date('2026-11-01T00:00:00');
const end = new Date('2026-12-01T00:00:00');
const at = (s: string) => new Date(s);

describe('xlsxWrite', () => {
  it('crc32 va ustun nomlari', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect([colName(0), colName(25), colName(26), colName(701), colName(702)]).toEqual(['A', 'Z', 'AA', 'ZZ', 'AAA']);
    expect(escapeXml('a<b>&"c"\u0001')).toBe('a&lt;b&gt;&amp;&quot;c&quot;');
  });

  it('yozilgan fayl loyihaning o\'z o\'quvchisi bilan qaytarib o\'qiladi', async () => {
    const bytes = buildXlsx([
      { name: 'Pul harakati', rows: [['Sana', 'Kirim', 'Izoh'], ['15.11.2026', 1_200_000, 'Ijara <noyabr> & boshqa'], ['=SUM(A1)', 0, null]], widths: [12, 14, 30] },
      { name: 'Sotuvlar/[2]', rows: [['Tovar', 'Soni'], ['iPhone 15', 2]] },
    ]);
    const sheets = await readXlsx(bytes);
    expect(sheets.map((s) => s.name)).toEqual(['Pul harakati', 'Sotuvlar 2']);
    expect(sheets[0].rows[1]).toEqual(['15.11.2026', 1_200_000, 'Ijara <noyabr> & boshqa']);
    // Formula emas — oddiy matn bo'lib qoladi
    expect(sheets[0].rows[2][0]).toBe('=SUM(A1)');
    expect(sheets[1].rows[1]).toEqual(['iPhone 15', 2]);
  });
});

describe('realization', () => {
  const sale = {
    _id: 's1', saleNo: 'S-1', status: 'partial', paymentType: 'debt', branchId: 'b1', totalAmount: 1_000_000,
    createdAt: at('2026-11-10T10:00:00'),
    customerSnapshot: { fullName: 'Ali', phone: '' },
    productSnapshot: { name: 'Telefon', imei: '1', purchasePrice: 700_000, saleQuantity: 1 },
    payments: [
      { amount: 300_000, paidAt: at('2026-11-10T10:00:01'), note: "Boshlang'ich to'lov" },
      { amount: 200_000, paidAt: at('2026-11-20T12:00:00'), method: 'click' },
      { amount: 100_000, paidAt: at('2026-12-02T12:00:00') }, // davrdan tashqarida
    ],
    returns: [{ qty: 1, amount: 50_000, debtReduced: 0, refundAmount: 50_000, returnedAt: at('2026-11-25T09:00:00'), by: 'a' }],
  } as never;

  it('sotuv to\'lovlari: bosh to\'lov va keyingi qarz to\'lovi ajratiladi, qaytarish — chiqim', () => {
    // Eski bekor qilingan — hisobdan tashqari; yangi tartibda (cancelledAt bor) — to'lovlari qoladi
    const rows = moneyRowsFromSales([sale, { ...(sale as object), _id: 's2', status: 'cancelled' } as never], start, end);
    const newCancel = moneyRowsFromSales([{ ...(sale as object), _id: 's3', status: 'cancelled', cancelledAt: at('2026-11-21T09:00:00') } as never], start, end);
    expect(newCancel.filter((r) => r.amountIn > 0).length).toBe(2);
    expect(soldRows([{ ...(sale as object), status: 'cancelled', cancelledAt: at('2026-11-21T09:00:00') } as never], start, end)).toEqual([]);
    expect(rows.map((r) => [r.kind, r.amountIn, r.amountOut, r.method])).toEqual([
      ['salePay', 300_000, 0, 'cash'],
      ['debtPay', 200_000, 0, 'click'],
      ['refund', 0, 50_000, 'cash'],
    ]);
  });

  it('moliya, bank va yetkazib beruvchi yozuvlari; jami', () => {
    const rows = [
      ...moneyRowsFromFlows([
        { _id: 'f1', type: 'expense', amount: 120_000, description: 'Ijara', category: 'Ijara', createdAt: at('2026-11-05T09:00:00') },
        { _id: 'f2', type: 'income', amount: 40_000, description: 'Boshqa', createdAt: at('2026-10-30T09:00:00') }, // tashqarida
      ], start, end),
      ...moneyRowsFromReceipts([{ bankName: 'Uzum', amount: 500_000, receivedAt: at('2026-11-15T09:00:00'), branchId: 'b1' }], start, end),
      ...moneyRowsFromSupplier([
        { supplierId: 'p1', type: 'payment', amount: 90_000, at: at('2026-11-16T09:00:00') },
        { supplierId: 'p1', type: 'purchase', amount: 900_000, at: at('2026-11-16T09:00:00') }, // pul emas
      ], new Map([['p1', 'Optom']]), start, end),
    ];
    expect(rows.map((r) => [r.kind, r.title, r.amountIn, r.amountOut])).toEqual([
      ['expense', 'Ijara', 0, 120_000],
      ['bank', 'Uzum', 500_000, 0],
      ['supplier', 'Optom', 0, 90_000],
    ]);
    expect(sumMoney(rows)).toEqual({ in: 500_000, out: 210_000, net: 290_000 });
  });

  it('sotilgan tovarlar: foyda = summa − tannarx × soni', () => {
    const [r] = soldRows([sale], start, end);
    expect([r.saleNo, r.total, r.cost, r.profit]).toEqual(['S-1', 1_000_000, 700_000, 300_000]);
    expect(soldRows([sale], end, new Date('2027-01-01'))).toEqual([]);
  });
});
