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

describe('writesCatalogPrice (tezkor sotuv, «Sotildi»)', () => {
  it('yagona dona yoki narxsiz tovarda — yoziladi; miqdorli tovarda — katalog narxi saqlanadi', async () => {
    const { writesCatalogPrice } = await import('@/lib/sales/createSales');
    expect(writesCatalogPrice({ salePrice: 100, trackQuantity: false }, 120)).toBe(true);
    expect(writesCatalogPrice({ salePrice: 0, trackQuantity: true }, 120)).toBe(true);
    expect(writesCatalogPrice({ salePrice: 100, trackQuantity: true }, 90)).toBe(false);
    expect(writesCatalogPrice({ salePrice: 100, trackQuantity: false, kind: 'service' }, 90)).toBe(false);
    expect(writesCatalogPrice({ salePrice: 100, trackQuantity: false }, 100)).toBe(false);
  });
});

describe('planWriteOffUndo — hisobdan chiqarishni bekor qilish', () => {
  it('planWriteOff ning teskarisi: qisman, butun qoldiq (sotilgan/nuqsonli), dona', async () => {
    const { planWriteOff, planWriteOffUndo } = await import('@/lib/stockAdjust');
    // qisman: 10 dan 3 — 7; bekor — 10
    const p = { trackQuantity: true, quantity: 10, soldQuantity: 0, unit: 'dona', status: 'in_stock' };
    const w = planWriteOff(p, 3);
    expect(w).toEqual({ ok: true, set: { quantity: 7 } });
    expect(planWriteOffUndo({ ...p, quantity: 7 }, 3)).toMatchObject({ ok: true, update: { $set: { quantity: 10, status: 'in_stock' } } });
    // butun qoldiq, avval 4 ta sotilgan: quantity 4, «sotilgan» → bekor: quantity 10, «sotuvda»
    expect(planWriteOffUndo({ trackQuantity: true, quantity: 4, soldQuantity: 4, status: 'sold' }, 6)).toMatchObject({ ok: true, update: { $set: { quantity: 10, status: 'in_stock' } } });
    // butun partiya nuqsonli (sotilmagan) — faqat holat
    expect(planWriteOffUndo({ trackQuantity: true, quantity: 5, soldQuantity: 0, status: 'defective' }, 5)).toMatchObject({ ok: true, update: { $set: { status: 'in_stock' } } });
    // dona: nuqsonli → sotuvda; keyin sotilgan bo'lsa — bekor qilinmaydi
    expect(planWriteOffUndo({ trackQuantity: false, status: 'defective' }, 1)).toMatchObject({ ok: true });
    expect(planWriteOffUndo({ trackQuantity: false, status: 'in_stock' }, 1)).toEqual({ ok: false });
  });
});
