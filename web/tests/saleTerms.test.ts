import { describe, expect, it } from 'vitest';
import { missingPriceRight, resolveSaleTerms, saleRemaining, saleTermsErrorText } from '@/lib/sales/terms';
import { getDictionary } from '@/lib/i18n/dict';

const ALL = { nasiya: true, variant: true, creditKassa: true };
const yes = async () => true;
const NOW = new Date('2026-03-10T10:00:00');

describe('resolveSaleTerms', () => {
  it('naqd — to\'langan = jami, muddat yo\'q', async () => {
    const r = await resolveSaleTerms({ paymentType: 'cash', total: 500, paid: 0, lineCount: 2, features: ALL, now: NOW }, yes);
    expect(r).toMatchObject({ ok: true, terms: { paymentType: 'cash', paid: 500, dueDate: undefined } });
  });

  it('nasiya: oylar 60 dan oshsa 60, to\'lov kuni bo\'yicha oxirgi oy muddat', async () => {
    const r = await resolveSaleTerms({ paymentType: 'installment', total: 1000, paid: 100, lineCount: 1, months: 3, payDay: 5, features: ALL, now: NOW }, yes);
    if (!r.ok) throw new Error('kutilmagan');
    expect(r.terms.months).toBe(3);
    expect(r.terms.dueDate?.getMonth()).toBe(5); // iyun
    expect(r.terms.dueDate?.getDate()).toBe(5);
    const big = await resolveSaleTerms({ paymentType: 'installment', total: 1000, lineCount: 1, months: 99, features: ALL, now: new Date('2025-01-01') }, yes);
    expect(big.ok && big.terms.months).toBe(60);
  });

  it('nasiya — bir nechta tovar rad, modul o\'chiq rad', async () => {
    expect(await resolveSaleTerms({ paymentType: 'installment', total: 1000, lineCount: 2, months: 3, features: ALL }, yes))
      .toEqual({ ok: false, error: { code: 'installmentOneItem' } });
    expect(await resolveSaleTerms({ paymentType: 'installment', total: 1000, lineCount: 1, months: 3, features: {} }, yes))
      .toEqual({ ok: false, error: { code: 'nasiyaDisabled' } });
  });

  it('bank + qarz (kunlar): tur «qarz», muddat bugun + N kun, qoldiq faqat mijoz qismi', async () => {
    const r = await resolveSaleTerms({
      paymentType: 'bank_credit', total: 1000, paid: 0, lineCount: 1, bankName: 'A', nasiyaAmount: 300, bankTermUnit: 'days', debtDays: 7, features: ALL, now: NOW,
    }, yes);
    if (!r.ok) throw new Error('kutilmagan');
    expect(r.terms).toMatchObject({ paymentType: 'debt', bankDebt: true, bankParts: [{ bankName: 'A', amount: 700 }] });
    expect(r.terms.dueDate?.toISOString().slice(0, 10)).toBe('2026-03-17');
    expect(saleRemaining(1000, 0, r.terms, r.terms.bankParts)).toBe(300);
  });

  it('bank: mijoz qismi qolgan summadan kam bo\'lishi kerak; faol bo\'lmagan bank rad', async () => {
    const big = await resolveSaleTerms({ paymentType: 'bank_credit', total: 1000, paid: 200, lineCount: 1, bankName: 'A', nasiyaAmount: 800, features: ALL }, yes);
    expect(big).toEqual({ ok: false, error: { code: 'nasiyaPartTooBig', rest: 800 } });
    const off = await resolveSaleTerms({ paymentType: 'bank_credit', total: 1000, lineCount: 1, bankName: 'A', features: ALL }, async () => false);
    expect(off).toEqual({ ok: false, error: { code: 'bankNotFound' } });
  });

  it('xato matni lug\'atdan', () => {
    const d = getDictionary('uz');
    expect(saleTermsErrorText({ code: 'nasiyaPartTooBig', rest: 800 }, d)).toContain('800');
    expect(saleTermsErrorText({ code: 'bankParts', reason: 'duplicate', financed: 1 }, d)).toBe(d.sales.actions.bankPartsDuplicate);
  });
});

describe('missingPriceRight', () => {
  it('arzon — chegirma, qimmat — narx o\'zgartirish, narxsiz — tekshirilmaydi', async () => {
    const none = async () => false;
    expect(await missingPriceRight(100, 90, true, none)).toBe('sale.discount');
    expect(await missingPriceRight(100, 110, true, none)).toBe('sale.editPrice');
    expect(await missingPriceRight(100, 100, true, none)).toBeNull();
    expect(await missingPriceRight(0, 50, false, none)).toBeNull();
  });
});
