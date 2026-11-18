/**
 * MXIK (IKPU) — mahsulot va xizmatlarning yagona elektron milliy katalogi kodi (tasnif.soliq.uz).
 * Kod 17 raqam: guruh (3) · sinf (5) · pozitsiya (8) · subpozitsiya (11) · brend (14) · atribut (17) —
 * katalog daraxti shu uzunliklarda (eski 8 xonali kodlar 17 xonaliga almashtirilgan).
 * Bu fayl DB/fetch importisiz — client (forma tekshiruvi) va server bir xil ishlatadi.
 */

export const MXIK_LENGTH = 17;
/** Rasmiy katalog (forma va hujjatlarda havola) */
export const MXIK_SITE_URL = 'https://tasnif.soliq.uz';

/** Kiritilgan matn → faqat raqamlar (bo'shliq, nuqta, tire olib tashlanadi) */
export function normalizeMxik(raw: unknown): string {
  return String(raw ?? '').replace(/[\s.\-–—]/g, '');
}

export function isMxikCode(v: unknown): v is string {
  return typeof v === 'string' && /^\d{17}$/.test(v);
}

/**
 * Formadagi qiymat: '' — bo'sh (olib tashlash), kod — to'g'ri, null — noto'g'ri format.
 * Restoran menyusidagi eski yozuvlar (5–30 raqam) tahrirlanmaguncha o'zgarmaydi — yangi kiritish faqat 17 xona.
 */
export function parseMxikInput(raw: unknown): string | null {
  const v = normalizeMxik(raw);
  if (!v) return '';
  return isMxikCode(v) ? v : null;
}

/** Kod darajalari (katalog daraxti): guruh, sinf, pozitsiya, subpozitsiya, brend */
export function mxikLevels(code: string): { group: string; class: string; position: string; subPosition: string; brand: string } | null {
  if (!isMxikCode(code)) return null;
  return { group: code.slice(0, 3), class: code.slice(0, 5), position: code.slice(0, 8), subPosition: code.slice(0, 11), brand: code.slice(0, 14) };
}

/** Ko'rinish: 009 01 001 001 048 019 */
export function formatMxik(code: string): string {
  if (!isMxikCode(code)) return code;
  return [code.slice(0, 3), code.slice(3, 5), code.slice(5, 8), code.slice(8, 11), code.slice(11, 14), code.slice(14)].join(' ');
}

/** Katalog qidiruvining bitta natijasi (UI va mobil API shu ko'rinishni oladi) */
export interface MxikItem {
  code: string;
  name: string;
  /** Qadoq/birlik: «шт. (банка) 24 грамм» */
  unit: string | null;
  /** Katalogdagi shtrix-kod (GTIN) */
  barcode: string | null;
  /** Katalogda markirovka belgisi (label = 1) — tamaki, pivo, suv, dori va h.k. */
  marked: boolean;
  group: string | null;
}

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
};

/**
 * tasnif.soliq.uz qidiruv javobidagi bitta yozuv → MxikItem. Tashqi ma'lumot — tekshirib olinadi:
 * kod 17 raqam bo'lmasa yoki nomi bo'lmasa — null.
 */
export function toMxikItem(raw: unknown): MxikItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const code = String(r.mxikCode ?? '').trim();
  const name = text(r.name ?? r.mxikName, 300);
  if (!isMxikCode(code) || !name) return null;
  const barcode = text(r.internationalCode, 20);
  return {
    code,
    name,
    unit: text(r.unitsName ?? r.unitName ?? r.packageName, 80),
    barcode: barcode && /^\d{8,14}$/.test(barcode) ? barcode : null,
    marked: String(r.label ?? '') === '1',
    group: text(r.groupName, 120),
  };
}

/** Qidiruv so'rovi: 2–80 belgi, ortiqcha bo'shliqlarsiz */
export function normalizeMxikQuery(raw: unknown): string | null {
  const q = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (q.length < 2 || q.length > 80) return null;
  return q;
}
