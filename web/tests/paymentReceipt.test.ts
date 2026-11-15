import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Types } from 'mongoose';
import PaymentReceiptPaper from '@/components/tenant/PaymentReceiptPaper';
import { getDictionary } from '@/lib/i18n/dict';
import type { ISale } from '@/lib/models/tenant/Sale';

const d = getDictionary('uz');
const receipt = { paperWidth: 80 as const, showSeller: true, showCustomer: true };
const org = { name: 'Savora Demo', phone: '+998 71 000 00 00' };

/** 4 oy × 1 000 000, boshlang'ich 100 000; 1-oyga 800 000 (200 000 keyingi 3 oyga bo'lingan) */
const sale = {
  saleNo: 'S20261115-0002',
  productId: new Types.ObjectId(),
  productSnapshot: { name: 'Samsung A35 128GB', imei: '356712400044904' },
  customerSnapshot: { fullName: 'Test Mijoz', phone: '+998 99 111 24 55' },
  branchId: new Types.ObjectId(),
  paymentType: 'installment',
  totalAmount: 4_100_000,
  paidAmount: 900_000,
  remainingAmount: 3_200_000,
  installmentMonths: 4,
  downPayment: 100_000,
  payDay: 5,
  installmentAmounts: [800_000, 1_066_666, 1_066_666, 1_066_668],
  status: 'partial',
  createdAt: new Date(2026, 10, 15, 10, 0),
  soldBy: 'admin',
  payments: [
    { amount: 100_000, paidAt: new Date(2026, 10, 15, 10, 0), note: "Boshlang'ich to'lov", recordedBy: 'admin' },
    {
      amount: 800_000, paidAt: new Date(2026, 11, 5, 11, 30), method: 'cash', recordedBy: 'kassir1',
      note: "1-oy (qisman) · 200 000 so'm 2–4-oylarga bo'lindi",
      months: { from: 1, to: 1, partialLast: true },
      carry: { amount: 200_000, from: 2, to: 4 },
      balanceAfter: 3_200_000,
    },
  ],
} as unknown as ISale;

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
const render = (i: number) =>
  text(renderToStaticMarkup(createElement(PaymentReceiptPaper, { sale, payment: sale.payments[i], index: i, org, receipt, d })));

describe("to'lov cheki", () => {
  it("nima uchun, qaysi oy, usul, qoldiq va keyingi to'lov yoziladi", () => {
    const t = render(1);
    expect(t).toContain("To'lov cheki");
    expect(t).toContain('S20261115-0002-2');
    expect(t).toContain('kassir1');
    expect(t).toContain('Samsung A35 128GB');
    expect(t).toContain('356712400044904');
    expect(t).toContain('1-oy (qisman)');
    expect(t).toMatch(/200\s000 so'm 2–4-oylarga bo'lindi/);
    expect(t).toContain('Naqd');
    expect(t).toMatch(/To'landi 800\s000 so'm/);
    expect(t).toMatch(/Jami to'langan 900\s000 so'm/);
    expect(t).toMatch(/Qoldiq 3\s200\s000 so'm/);
    expect(t).toContain("To'langan oylar 1 / 4");
    // Keyingi to'lov: 2-oy, to'lov kuni bo'yicha 5-yanvar, 1 066 666
    expect(t).toMatch(/Keyingi to'lov 05\.01\.2027 — 1\s066\s666 so'm/);
  });

  it("boshlang'ich to'lov cheki — maqsad «Boshlang'ich to'lov», eski to'lovda keyingi to'lov yo'q", () => {
    const t = render(0);
    expect(t).toContain("To'lov maqsadi Boshlang'ich to'lov");
    expect(t).not.toContain("Keyingi to'lov");
  });
});
