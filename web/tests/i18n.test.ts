import { describe, it, expect } from 'vitest';
import { dictionaries } from '@/lib/i18n/dict';
import { tr, plural, fmtMonthYear, fmtDayMonth } from '@/lib/i18n/fmt';
import { isLocale } from '@/lib/i18n/config';

type Obj = Record<string, unknown>;

function flatten(o: Obj, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v as Obj, key));
    else if (Array.isArray(v)) v.forEach((x, i) => { if (typeof x === 'string') out[`${key}[${i}]`] = x; else if (x && typeof x === 'object') Object.assign(out, flatten(x as Obj, `${key}[${i}]`)); });
    else out[key] = String(v);
  }
  return out;
}

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');

describe('i18n lug\'atlari', () => {
  const uz = flatten(dictionaries.uz as unknown as Obj);
  const ru = flatten(dictionaries.ru as unknown as Obj);

  it('ru va uz kalitlari bir xil', () => {
    const missingInRu = Object.keys(uz).filter((k) => !(k in ru));
    const extraInRu = Object.keys(ru).filter((k) => !(k in uz));
    expect(missingInRu, 'ru\'da yetishmaydi').toEqual([]);
    expect(extraInRu, 'ru\'da ortiqcha').toEqual([]);
  });

  it('bo\'sh satr yo\'q', () => {
    const empty = [...Object.entries(uz), ...Object.entries(ru)].filter(([, v]) => v.trim() === '').map(([k]) => k);
    expect(empty).toEqual([]);
  });

  it('{param} joylari ikkala tilda mos', () => {
    const bad = Object.keys(uz).filter((k) => k in ru && placeholders(uz[k]) !== placeholders(ru[k]));
    expect(bad).toEqual([]);
  });

  it('ru matnlari o\'zbekcha nusxa emas (kirill bor)', () => {
    // 3 so'zdan uzun, lotin harfli ru qiymatlar — tarjima qilinmagan bo'lishi mumkin.
    const suspicious = Object.entries(ru)
      .filter(([k, v]) => v.split(/\s+/).length > 3 && !/[А-Яа-яЁё]/.test(v) && uz[k] === v)
      .map(([k]) => k);
    expect(suspicious).toEqual([]);
  });
});

describe('fmt', () => {
  it('tr parametrlarni qo\'yadi', () => {
    expect(tr('{n} ta, {x}', { n: 5, x: 'a' })).toBe('5 ta, a');
    expect(tr('{n} ta', {})).toBe('{n} ta');
  });
  it('plural (ru)', () => {
    const f = ['товар', 'товара', 'товаров'] as const;
    expect(plural(1, f)).toBe('товар');
    expect(plural(2, f)).toBe('товара');
    expect(plural(5, f)).toBe('товаров');
    expect(plural(11, f)).toBe('товаров');
    expect(plural(21, f)).toBe('товар');
    expect(plural(3, ['ta'])).toBe('ta');
  });
  it('oy formatlari', () => {
    const d = new Date(2026, 9, 15);
    expect(fmtMonthYear(d, 'uz')).toBe('2026-yil oktabr');
    expect(fmtMonthYear(d, 'ru')).toBe('октябрь 2026');
    expect(fmtDayMonth(d, 'uz')).toBe('15-oktabr');
    expect(fmtDayMonth(d, 'ru')).toBe('15 октября');
  });
  it('isLocale', () => {
    expect(isLocale('ru')).toBe(true);
    expect(isLocale('en')).toBe(false);
  });
});
