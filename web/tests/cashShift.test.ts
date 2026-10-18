/**
 * Kassa smenasi: joriy summa hisobi (sof funksiya) va "filialda bitta ochiq smena" qoidasi.
 * Mongo qismi faqat MONGO_TEST_URI berilsa ishlaydi:
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27019 npx vitest run tests/cashShift.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { computeShiftTotals, isDuplicateKeyError } from '@/lib/cashShift';
import { cashShiftSchema, type ICashShift } from '@/lib/models/tenant/CashShift';
import type { ISale } from '@/lib/models/tenant/Sale';

const from = new Date('2026-10-19T08:00:00');
const to = new Date('2026-10-19T20:00:00');
const at = (h: number) => new Date(`2026-10-19T${String(h).padStart(2, '0')}:00:00`);

function sale(p: Partial<ISale> & { payments?: { amount: number; paidAt: Date; note?: string }[] }): ISale & { _id: unknown } {
  return {
    _id: new Types.ObjectId(),
    saleNo: 'S-1',
    status: 'paid',
    paymentType: 'cash',
    productSnapshot: { name: 'Telefon', imei: '1' },
    customerSnapshot: { fullName: 'Ali' },
    payments: [],
    returns: [],
    ...p,
  } as unknown as ISale & { _id: unknown };
}

describe('computeShiftTotals', () => {
  it("ochilish + naqd tushum − qaytarish − admin olgan; oraliqdan tashqarisi hisobga olinmaydi", () => {
    const sales = [
      sale({ payments: [{ amount: 1_000_000, paidAt: at(10) }] }),
      // Nasiya: faqat boshlang'ich (naqd) to'lov kassaga tushadi
      sale({ paymentType: 'installment', payments: [{ amount: 300_000, paidAt: at(11), note: "Boshlang'ich to'lov" }, { amount: 200_000, paidAt: at(12), note: 'Karta' }] }),
      // Smenadan oldin — hisoblanmaydi
      sale({ payments: [{ amount: 9_000_000, paidAt: at(7) }] }),
      // Qaytarish — kassadan chiqim
      sale({ payments: [{ amount: 500_000, paidAt: at(7) }], returns: [{ refundAmount: 150_000, returnedAt: at(15) }] as unknown as ISale['returns'] }),
      // Bekor qilingan sotuv hisoblanmaydi
      sale({ status: 'cancelled', payments: [{ amount: 700_000, paidAt: at(13) }] }),
    ];
    const flows = [
      { type: 'expense' as const, amount: 250_000, createdAt: at(16) },
      { type: 'income' as const, amount: 300_000, createdAt: at(17) },
      { type: 'expense' as const, amount: 100_000, createdAt: at(21) },
    ];
    const t = computeShiftTotals(sales, flows, 200_000, from, to);
    expect(t).toEqual({ cashIn: 1_300_000, refunds: 150_000, withdrawals: 250_000, deposits: 300_000, current: 200_000 + 1_300_000 - 150_000 - 250_000 + 300_000 });
  });

  it('harakat bo\'lmasa joriy summa = ochilish summasi', () => {
    expect(computeShiftTotals([], [], 50_000, from, to).current).toBe(50_000);
  });
});

const URI = process.env.MONGO_TEST_URI;

describe.skipIf(!URI)('CashShift (MongoDB)', () => {
  let conn: mongoose.Connection;
  let Shift: mongoose.Model<ICashShift>;

  beforeAll(async () => {
    conn = await mongoose.createConnection(`${URI}/savora_cashshift_test_${Date.now()}`).asPromise();
    Shift = conn.model<ICashShift>('CashShift', cashShiftSchema);
    await Shift.init();
  });
  afterAll(async () => {
    await conn?.dropDatabase();
    await conn?.close();
  });

  it('bitta filialda ikkinchi ochiq smena rad etiladi, yopilgandan keyin yangisi ochiladi', async () => {
    const branchId = new Types.ObjectId();
    const first = await Shift.create({ shiftNo: 'K-0001', branchId, status: 'open', openedBy: 'ali', openingCash: 0 });

    const dup = await Shift.create({ shiftNo: 'K-0002', branchId, status: 'open', openedBy: 'vali', openingCash: 0 }).catch((e) => e);
    expect(isDuplicateKeyError(dup)).toBe(true);

    // Boshqa filialda bemalol
    await Shift.create({ shiftNo: 'K-0003', branchId: new Types.ObjectId(), status: 'open', openedBy: 'ali', openingCash: 0 });

    await Shift.updateOne({ _id: first._id }, { status: 'closed', closedAt: new Date() });
    const next = await Shift.create({ shiftNo: 'K-0004', branchId, status: 'open', openedBy: 'ali', openingCash: 10 });
    expect(next.status).toBe('open');
  });
});
