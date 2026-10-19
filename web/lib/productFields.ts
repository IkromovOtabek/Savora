import {
  PRODUCT_UNITS,
  productFieldsFor,
  type ProductFieldKey,
  type ProductUnit,
} from './businessTypes';
import { tr } from './i18n/fmt';

/**
 * Yo'nalishga xos mahsulot maydonlarini o'qish va tekshirish (web action'lar va mobil API uchun bitta joy).
 * Faqat shu yo'nalish konfiguratsiyasidagi (PRODUCT_FIELDS) maydonlar o'qiladi — qolganlari e'tiborsiz.
 */

export interface ProductFieldValues {
  category?: string;
  unit?: ProductUnit;
  size?: string;
  color?: string;
  warrantyMonths?: number;
  batchNumber?: string;
  expiryDate?: Date;
  oemCode?: string;
}

export type ProductFieldReason = 'required' | 'invalid' | 'tooLong';

export type ProductFieldsResult =
  | { ok: true; keys: ProductFieldKey[]; values: ProductFieldValues }
  | { ok: false; key: ProductFieldKey; reason: ProductFieldReason };

/** Matn maydonlari uzunlik chegarasi */
export const PRODUCT_FIELD_MAX_LEN: Partial<Record<ProductFieldKey, number>> = {
  category: 60,
  size: 20,
  color: 40,
  batchNumber: 40,
  oemCode: 40,
};

export const WARRANTY_MAX_MONTHS = 120;

/** "2027-03-31" (web date input) yoki "31.03.2027" (mobil) → UTC yarim tun; noto'g'ri bo'lsa null */
export function parseExpiryDate(raw: string): Date | null {
  const v = raw.trim();
  let y: number, mo: number, d: number;
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) {
    [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else {
    m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(v);
    if (!m) return null;
    [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  if (y < 2000 || y > 2100) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  // 31.02 kabi mavjud bo'lmagan sanalar Date tomonidan "suriladi" — tekshiramiz
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

/** Sana → "YYYY-MM-DD" (web date input qiymati) */
export function toDateInputValue(d?: Date | string | null): string {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

export function isProductUnit(v: unknown): v is ProductUnit {
  return typeof v === 'string' && (PRODUCT_UNITS as readonly string[]).includes(v);
}

function str(v: unknown): string {
  return v === undefined || v === null ? '' : String(v).trim();
}

/**
 * read(key) — formadagi/JSON'dagi xom qiymat. Bo'sh qiymat = maydon tozalanadi (undefined).
 */
export function parseProductFields(
  businessType: string | undefined,
  read: (key: ProductFieldKey) => unknown,
): ProductFieldsResult {
  const specs = productFieldsFor(businessType);
  const values: ProductFieldValues = {};

  for (const { key, required } of specs) {
    const raw = str(read(key));
    if (!raw) {
      if (required) return { ok: false, key, reason: 'required' };
      continue;
    }
    const max = PRODUCT_FIELD_MAX_LEN[key];
    if (max && raw.length > max) return { ok: false, key, reason: 'tooLong' };

    switch (key) {
      case 'unit':
        if (!isProductUnit(raw)) return { ok: false, key, reason: 'invalid' };
        values.unit = raw;
        break;
      case 'warrantyMonths': {
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 0 || n > WARRANTY_MAX_MONTHS) return { ok: false, key, reason: 'invalid' };
        values.warrantyMonths = n;
        break;
      }
      case 'expiryDate': {
        const date = parseExpiryDate(raw);
        if (!date) return { ok: false, key, reason: 'invalid' };
        values.expiryDate = date;
        break;
      }
      case 'batchNumber':
      case 'oemCode':
        values[key] = raw.toUpperCase();
        break;
      default:
        values[key] = raw;
    }
  }
  return { ok: true, keys: specs.map((s) => s.key), values };
}

/** Xato matni: {field} — maydon yorlig'i (lug'atdan) */
export function productFieldErrorText(
  res: Extract<ProductFieldsResult, { ok: false }>,
  labels: Record<ProductFieldKey, string>,
  msg: { fieldRequired: string; fieldInvalid: string; fieldTooLong: string },
): string {
  const tpl = res.reason === 'required' ? msg.fieldRequired : res.reason === 'tooLong' ? msg.fieldTooLong : msg.fieldInvalid;
  return tr(tpl, { field: labels[res.key] });
}

/** Do'kondagi mavjud kategoriyalar (formada taklif uchun), alifbo bo'yicha, ko'pi bilan 200 ta */
export async function loadCategories(Product: { distinct(field: 'category'): PromiseLike<unknown[]> }): Promise<string[]> {
  const raw = await Product.distinct('category');
  return raw
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 200);
}
