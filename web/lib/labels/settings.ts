/**
 * Barkod yorlig'i sozlamalari (ShopSettings.label) — server ham, brauzer ham ishlatadi (importlarsiz).
 * Yorliq termal printerda (203 dpi) bitta yorliq = bitta sahifa (@page o'lchami) sifatida chop etiladi.
 */

/** Yorliqda chiqadigan maydonlar (tartib — yorliqdagi joylashuv tartibi) */
export const LABEL_FIELDS = ['shop', 'name', 'attrs', 'code', 'price', 'warranty', 'date', 'productId'] as const;
export type LabelField = (typeof LABEL_FIELDS)[number];

export const LABEL_TEXT_SIZES = ['s', 'm', 'l'] as const;
export type LabelTextSize = (typeof LABEL_TEXT_SIZES)[number];

/** Do'konlarda keng tarqalgan termal yorliq rulonlari (mm) */
export const LABEL_PRESETS: readonly { w: number; h: number }[] = [
  { w: 58, h: 40 },
  { w: 40, h: 30 },
  { w: 58, h: 30 },
  { w: 43, h: 25 },
  { w: 30, h: 20 },
];

export const LABEL_LIMITS = { minW: 25, maxW: 100, minH: 15, maxH: 80, maxCopies: 50 } as const;

export interface LabelSettings {
  /** mm */
  width: number;
  height: number;
  fields: LabelField[];
  textSize: LabelTextSize;
  /** Har mahsulotga sukut bo'yicha nusxa */
  copies: number;
  /** Omborga qo'shilgach chop etish oynasi o'zi ochilsin */
  autoPrint: boolean;
}

/** Saqlangan ko'rinishi: hammasi ixtiyoriy (eski hujjatlar) */
export type StoredLabelSettings = Partial<LabelSettings>;

/** Sukut: telefon do'koni — qo'shilgach darhol chop etish (IMEI yorlig'i), boshqalar — qo'lda */
export function defaultLabelSettings(phoneShop: boolean): LabelSettings {
  return {
    width: 40,
    height: 30,
    fields: phoneShop ? ['name', 'attrs', 'code', 'price'] : ['name', 'code', 'price'],
    textSize: 'm',
    copies: 1,
    autoPrint: phoneShop,
  };
}

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Saqlangan qiymatni sukut ustiga qo'yib, chegaralarga keltiradi */
export function resolveLabelSettings(stored: StoredLabelSettings | null | undefined, phoneShop: boolean): LabelSettings {
  const d = defaultLabelSettings(phoneShop);
  const s = stored ?? {};
  const fields = Array.isArray(s.fields) ? LABEL_FIELDS.filter((f) => s.fields!.includes(f)) : d.fields;
  return {
    width: clampInt(s.width, LABEL_LIMITS.minW, LABEL_LIMITS.maxW, d.width),
    height: clampInt(s.height, LABEL_LIMITS.minH, LABEL_LIMITS.maxH, d.height),
    fields,
    textSize: (LABEL_TEXT_SIZES as readonly string[]).includes(s.textSize ?? '') ? s.textSize! : d.textSize,
    copies: clampInt(s.copies, 1, LABEL_LIMITS.maxCopies, d.copies),
    autoPrint: typeof s.autoPrint === 'boolean' ? s.autoPrint : d.autoPrint,
  };
}

/** Yorliqqa chiqadigan bitta mahsulot ma'lumoti */
export interface LabelItem {
  id: string;
  name: string;
  /** Barkodga yoziladigan qiymat — kassa/ombor skaneri shu bo'yicha topadi */
  code: string;
  codeKind: 'imei' | 'barcode' | 'productId';
  /** Sotish narxi (so'm), 0 — narx yo'q */
  price: number;
  productId?: string;
  /** Rang · model · o'lcham */
  attrs?: string;
  warrantyMonths?: number;
  /** YYYY-MM-DD */
  date?: string;
  /** Telefon: IMEI hali kiritilmagan — barkodda mahsulot ID */
  imeiPending?: boolean;
  /** Sanaladigan tovarning qoldig'i (dona yorlig'i uchun) — sanalmasa 1 */
  available: number;
}

/** Mahsulot hujjatidan barkod qiymati: telefon — IMEI, shtrix-kodli — o'sha, aks holda mahsulot ID */
export function labelCodeOf(
  p: { imei?: string; imeiPending?: boolean; barcode?: string; productId?: string; kind?: string },
  phoneShop: boolean,
): { code: string; codeKind: LabelItem['codeKind'] } {
  const goods = (p.kind ?? 'goods') === 'goods';
  if (phoneShop && goods && p.imei && !p.imeiPending) return { code: p.imei, codeKind: 'imei' };
  if (p.barcode) return { code: p.barcode, codeKind: 'barcode' };
  if (p.productId) return { code: p.productId, codeKind: 'productId' };
  return { code: p.imei ?? '', codeKind: 'barcode' };
}
