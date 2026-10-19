import { describe, it, expect } from 'vitest';
import { BUSINESS_TYPE_IDS, PRODUCT_FIELDS, productFieldsFor } from '@/lib/businessTypes';
import { parseExpiryDate, parseProductFields, productFieldErrorText, toDateInputValue } from '@/lib/productFields';
import { getDictionary } from '@/lib/i18n/dict';

const reader = (data: Record<string, unknown>) => (key: string) => data[key];

describe('PRODUCT_FIELDS — yo\'nalish konfiguratsiyasi', () => {
  it('har yo\'nalishda kategoriya bor, kalitlar takrorlanmaydi', () => {
    for (const bt of BUSINESS_TYPE_IDS) {
      const keys = PRODUCT_FIELDS[bt].map((f) => f.key);
      expect(keys).toContain('category');
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('noma\'lum yo\'nalish → general', () => {
    expect(productFieldsFor('nope')).toEqual(PRODUCT_FIELDS.general);
    expect(productFieldsFor(undefined)).toEqual(PRODUCT_FIELDS.general);
  });

  it('lug\'atda har maydon uchun uz/ru yorliq bor', () => {
    for (const loc of ['uz', 'ru'] as const) {
      const labels = getDictionary(loc).stock.fields.labels;
      for (const bt of BUSINESS_TYPE_IDS) {
        for (const f of PRODUCT_FIELDS[bt]) expect(labels[f.key]).toBeTruthy();
      }
    }
  });
});

describe('parseExpiryDate', () => {
  it('ISO va KK.OO.YYYY formatlari', () => {
    expect(parseExpiryDate('2027-03-31')?.toISOString()).toBe('2027-03-31T00:00:00.000Z');
    expect(parseExpiryDate('31.03.2027')?.toISOString()).toBe('2027-03-31T00:00:00.000Z');
  });

  it('mavjud bo\'lmagan sana va chegaradan tashqari yil rad etiladi', () => {
    expect(parseExpiryDate('31.02.2027')).toBeNull();
    expect(parseExpiryDate('2027-13-01')).toBeNull();
    expect(parseExpiryDate('01.01.1999')).toBeNull();
    expect(parseExpiryDate('2027/03/31')).toBeNull();
    expect(parseExpiryDate('')).toBeNull();
  });

  it('toDateInputValue — sanani input qiymatiga qaytaradi', () => {
    expect(toDateInputValue(new Date('2027-03-31T00:00:00Z'))).toBe('2027-03-31');
    expect(toDateInputValue(undefined)).toBe('');
  });
});

describe('parseProductFields', () => {
  it('faqat yo\'nalish maydonlari o\'qiladi', () => {
    const res = parseProductFields('general', reader({ category: ' Ichimlik ', oemCode: 'X1', unit: 'kg' }));
    expect(res).toEqual({ ok: true, keys: ['category'], values: { category: 'Ichimlik' } });
  });

  it('dorixona: yaroqlilik muddati majburiy, seriya katta harfda', () => {
    expect(parseProductFields('pharmacy', reader({ batchNumber: 'ab12' }))).toEqual({ ok: false, key: 'expiryDate', reason: 'required' });
    const res = parseProductFields('pharmacy', reader({ batchNumber: 'ab12', expiryDate: '2027-01-15' }));
    expect(res.ok && res.values).toEqual({ batchNumber: 'AB12', expiryDate: new Date('2027-01-15T00:00:00Z') });
  });

  it('o\'lchov birligi faqat ro\'yxatdan', () => {
    expect(parseProductFields('building', reader({ unit: 'qop' })).ok).toBe(true);
    expect(parseProductFields('building', reader({ unit: 'tonna' }))).toEqual({ ok: false, key: 'unit', reason: 'invalid' });
  });

  it('kafolat: 0..120 butun oy', () => {
    const ok = parseProductFields('phone_shop', reader({ warrantyMonths: '12' }));
    expect(ok.ok && ok.values.warrantyMonths).toBe(12);
    expect(parseProductFields('phone_shop', reader({ warrantyMonths: '1.5' }))).toMatchObject({ ok: false, reason: 'invalid' });
    expect(parseProductFields('phone_shop', reader({ warrantyMonths: 121 }))).toMatchObject({ ok: false, reason: 'invalid' });
    expect(parseProductFields('phone_shop', reader({ warrantyMonths: -1 }))).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('bo\'sh qiymat — maydon tozalanadi (kalit ro\'yxatda qoladi)', () => {
    const res = parseProductFields('clothing', reader({ size: '  ', color: '' }));
    expect(res).toEqual({ ok: true, keys: ['category', 'size', 'color'], values: {} });
  });

  it('uzun matn rad etiladi', () => {
    expect(parseProductFields('auto_parts', reader({ oemCode: 'X'.repeat(41) }))).toEqual({ ok: false, key: 'oemCode', reason: 'tooLong' });
  });

  it('xato matni lug\'atdan', () => {
    const res = parseProductFields('pharmacy', reader({}));
    if (res.ok) throw new Error('kutilgan xato');
    const st = getDictionary('uz').stock;
    expect(productFieldErrorText(res, st.fields.labels, st.msg)).toBe('«Yaroqlilik muddati» kiritilishi shart.');
  });
});
