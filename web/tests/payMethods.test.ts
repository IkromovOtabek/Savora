/**
 * To'lov usullari: kassada to'lovni hisoblash (qaytim, aralash, qarz), qatorlarga taqsimlash,
 * smenada karta naqdga qo'shilmasligi va ochiq chek havolasi imzosi.
 */
import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { allocateParts, methodOf, settlePayment } from '@/lib/payMethods';
import { computeShiftTotals } from '@/lib/cashShift';
import { parseReceiptToken, receiptToken } from '@/lib/receiptLink';
import type { ISale } from '@/lib/models/tenant/Sale';

describe('settlePayment', () => {
  it("naqd ortiqcha — qaytim, sotuvga aniq summa yoziladi", () => {
    const r = settlePayment(15000, [{ method: 'cash', amount: 20000 }], 'full');
    expect(r).toEqual({ ok: true, parts: [{ method: 'cash', amount: 15000 }], paid: 15000, change: 5000 });
  });

  it('aralash: karta + naqd, qaytim faqat naqddan', () => {
    const r = settlePayment(100000, [{ method: 'uzcard', amount: 60000 }, { method: 'cash', amount: 50000 }], 'full');
    expect(r).toEqual({ ok: true, parts: [{ method: 'cash', amount: 40000 }, { method: 'uzcard', amount: 60000 }], paid: 100000, change: 10000 });
  });

  it('karta summadan oshsa — rad', () => {
    expect(settlePayment(10000, [{ method: 'humo', amount: 12000 }], 'full')).toEqual({ ok: false, reason: 'overpaidCard' });
  });

  it('yetmasa — rad (to\'liq rejim)', () => {
    expect(settlePayment(10000, [{ method: 'cash', amount: 9000 }], 'full')).toEqual({ ok: false, reason: 'underpaid' });
  });

  it('qarz: qisman yoki 0 to\'lov mumkin, ortiqcha — rad', () => {
    expect(settlePayment(10000, [], 'debt')).toEqual({ ok: true, parts: [], paid: 0, change: 0 });
    expect(settlePayment(10000, [{ method: 'click', amount: 4000 }], 'debt')).toMatchObject({ ok: true, paid: 4000 });
    expect(settlePayment(10000, [{ method: 'cash', amount: 11000 }], 'debt')).toEqual({ ok: false, reason: 'overpaid' });
  });

  it('bir xil usullar qo\'shiladi, 0 lar tashlanadi', () => {
    const r = settlePayment(5000, [{ method: 'payme', amount: 2000 }, { method: 'payme', amount: 3000 }, { method: 'cash', amount: 0 }], 'full');
    expect(r).toMatchObject({ ok: true, parts: [{ method: 'payme', amount: 5000 }], change: 0 });
  });
});

describe('allocateParts', () => {
  it("qatorlarni tartib bilan to'ldiradi, yig'indi aniq", () => {
    const out = allocateParts([7000, 3000, 5000], [{ method: 'cash', amount: 8000 }, { method: 'uzcard', amount: 7000 }]);
    expect(out).toEqual([
      [{ method: 'cash', amount: 7000 }],
      [{ method: 'cash', amount: 1000 }, { method: 'uzcard', amount: 2000 }],
      [{ method: 'uzcard', amount: 5000 }],
    ]);
  });

  it('qarzda to\'lanmagan qatorlar bo\'sh qoladi', () => {
    expect(allocateParts([5000, 5000], [{ method: 'cash', amount: 3000 }])).toEqual([[{ method: 'cash', amount: 3000 }], []]);
  });
});

describe('smena: karta naqd kassaga qo\'shilmaydi', () => {
  const from = new Date('2026-10-22T08:00:00');
  const to = new Date('2026-10-22T20:00:00');
  const at = new Date('2026-10-22T12:00:00');
  const sale = (payments: ISale['payments'], paymentType: ISale['paymentType'] = 'cash') => ({
    _id: new Types.ObjectId(), saleNo: 'S-1', status: 'paid', paymentType,
    productSnapshot: { name: 'Pepsi', imei: '1' }, payments, returns: [],
  }) as unknown as ISale & { _id: unknown };

  it('eski (method yo\'q) — naqd; uzcard — cardIn', () => {
    const t = computeShiftTotals([
      sale([{ amount: 10000, paidAt: at }]),
      sale([{ amount: 5000, paidAt: at, method: 'cash' }, { amount: 7000, paidAt: at, method: 'uzcard' }]),
    ], [], 1000, from, to);
    expect(t.cashIn).toBe(15000);
    expect(t.cardIn).toBe(7000);
    expect(t.current).toBe(16000);
  });

  it("qarzdagi bosh to'lov: naqd qismi kassaga, karta qismi — yo'q", () => {
    const note = "Boshlang'ich to'lov";
    const t = computeShiftTotals([
      sale([{ amount: 3000, paidAt: at, method: 'cash', note }, { amount: 2000, paidAt: at, method: 'humo', note }], 'debt'),
    ], [], 0, from, to);
    expect(t.cashIn).toBe(3000);
    expect(t.cardIn).toBe(2000);
  });

  it('methodOf: noma\'lum qiymat — naqd', () => {
    expect(methodOf({})).toBe('cash');
    expect(methodOf({ method: 'visa' })).toBe('cash');
    expect(methodOf({ method: 'click' })).toBe('click');
  });
});

describe('ochiq chek havolasi', () => {
  const org = 'a'.repeat(24);
  it("imzo to'g'ri — o'qiladi, buzilsa — null", () => {
    const t = receiptToken(org, 'AbC_12-xyz09', 's3cret');
    expect(parseReceiptToken(t, 's3cret')).toEqual({ orgId: org, checkoutId: 'AbC_12-xyz09' });
    expect(parseReceiptToken(t, 'boshqa')).toBeNull();
    expect(parseReceiptToken(t.replace('AbC', 'AbD'), 's3cret')).toBeNull();
    expect(parseReceiptToken('yaroqsiz', 's3cret')).toBeNull();
  });
});
