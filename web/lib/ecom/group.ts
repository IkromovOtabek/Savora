import { createHash } from 'crypto';
import type { Types } from 'mongoose';
import type { IProduct } from '../models/tenant/Product';
import { getStockQty } from '../productQuantity';
import { addQty, isFractionalUnit } from '../qty';
import { isOwnUploadUrl } from '../fileUrl';
import { isSampleItemCode } from '../onboardingSamples';

/**
 * E-commerce qoidalari (toza funksiyalar — sync, biznes paneli va testlar uchun umumiy).
 *
 * Tovar xaridorga chiqadi, agar:
 *  1) oddiy tovar (xizmat/to'plam/tizim qatori emas, restoran stop-listida emas);
 *  2) sotish narxi > 0 — narxsiz tovar HECH QACHON chiqmaydi;
 *  3) omborda qoldig'i bor;
 *  4) chiqarish yoqilgan: egasi qo'lda tanlagan (ecomListed) yoki — tanlamagan bo'lsa — do'konda
 *     «avtomatik chiqarish» yoqiq. Ro'yxatdan o'tish ustasining namuna tovari (`itemCode = NAMUNA-…`) avtomatik
 *     chiqmaydi — faqat egasi aniq «ko'rsatish» desa (soxta tovar ommaviy bozorga tushmasin).
 *
 * Bir xil tovarlar (nom + tur + rang) bitta guruh = bitta kartochka: telefon do'konidagi har dona alohida
 * hujjat va filiallardagi nusxalar xaridorga bitta mahsulot bo'lib ko'rinadi, qoldiq yig'iladi.
 */

export const ECOM_MAX_IMAGES = 6;
export const ECOM_DESC_MAX = 2000;

export type EcomSourceProduct = Pick<
  IProduct,
  | 'name' | 'variantName' | 'color' | 'salePrice' | 'oldPrice' | 'kind' | 'status' | 'trackQuantity' | 'quantity'
  | 'soldQuantity' | 'unit' | 'stopListed' | 'systemKey' | 'ecomListed' | 'ecomDescription' | 'ecomImages' | 'photoUrl'
  | 'category' | 'brand' | 'itemCode'
> & { _id: Types.ObjectId | string; updatedAt?: Date | string };

/** Kalit uchun nom bo'lagi: kichik harf, ortiqcha bo'shliqsiz */
function keyPart(v: string | undefined | null): string {
  return String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Guruh kaliti — do'kon ichida barqaror (nom/tur/rang o'zgarmaguncha) */
export function ecomGroupKey(p: Pick<IProduct, 'name' | 'variantName' | 'color'>): string {
  const raw = `${keyPart(p.name)}|${keyPart(p.variantName)}|${keyPart(p.color)}`;
  return createHash('sha1').update(raw).digest('hex').slice(0, 20);
}

export function isEcomGroupKey(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{20}$/.test(v);
}

/** Tovar turi e-commerce'ga mos (narx va qoldiqdan qat'i nazar) */
export function isEcomEligibleKind(p: Pick<IProduct, 'kind' | 'systemKey' | 'stopListed'>): boolean {
  if (p.systemKey || p.stopListed) return false;
  return !p.kind || p.kind === 'goods';
}

/** Xaridor uchun mavjud miqdor (narx bo'lsa) */
export function ecomAvailableQty(p: EcomSourceProduct): number {
  if (!isEcomEligibleKind(p) || p.status !== 'in_stock' || !(p.salePrice > 0)) return 0;
  return getStockQty(p);
}

/**
 * Mavjud buyurtmani bajarish uchun qoldiq (qabul/yakunlash): narx > 0 va stop-list sharti YO'Q — narx buyurtmada
 * qotgan, egasi keyin narxni o'chirsa yoki stop-listga qo'ysa ham qabul qilingan buyurtma bajarilishi kerak.
 * Faqat omborda turgan oddiy tovar (xizmat/to'plam/tizim qatori emas).
 */
export function orderAvailableQty(p: EcomSourceProduct): number {
  if (p.systemKey || (p.kind && p.kind !== 'goods') || p.status !== 'in_stock') return 0;
  return getStockQty(p);
}

/** Egasi tanlovi bo'lmasa — do'kon sozlamasi */
export function resolveEcomListed(explicit: boolean | undefined | null, autoPublish: boolean): boolean {
  return typeof explicit === 'boolean' ? explicit : autoPublish;
}

export type EcomGroupState = 'live' | 'noPrice' | 'hidden';

export interface EcomGroup {
  key: string;
  name: string;
  variantName?: string;
  color?: string;
  /** Guruhdagi barcha hujjatlar (narxsizlari ham) */
  allIds: string[];
  /** Sotiladigan hujjatlar (narx > 0, qoldig'i bor) */
  sellIds: string[];
  qty: number;
  price: number;
  maxPrice: number;
  oldPrice?: number;
  unit?: string;
  category?: string;
  brand?: string;
  description?: string;
  images: string[];
  /** Egasining aniq tanlovi (guruh bo'yicha) yoki undefined — avtomatik */
  explicit?: boolean;
  listed: boolean;
  state: EcomGroupState;
}

function ts(v: Date | string | undefined): number {
  return v ? new Date(v).getTime() || 0 : 0;
}

/** Rasmlar: o'z storage'imizdagi URL'lar, takrorsiz, ≤ ECOM_MAX_IMAGES; e-com rasmi bo'lmasa — asosiy rasm */
export function ecomImagesOf(p: Pick<IProduct, 'ecomImages' | 'photoUrl'>): string[] {
  const list = (p.ecomImages?.length ? p.ecomImages : p.photoUrl ? [p.photoUrl] : [])
    .filter((u) => typeof u === 'string' && isOwnUploadUrl(u));
  return [...new Set(list)].slice(0, ECOM_MAX_IMAGES);
}

/**
 * Hujjatlarni guruhlaydi. `products` — do'konning omborda turgan tovarlari (status: in_stock).
 * Natija tartibi: nom bo'yicha.
 */
export function buildEcomGroups(products: EcomSourceProduct[], autoPublish: boolean): EcomGroup[] {
  const byKey = new Map<string, EcomSourceProduct[]>();
  for (const p of products) {
    if (!isEcomEligibleKind(p) || p.status !== 'in_stock') continue;
    const k = ecomGroupKey(p);
    const arr = byKey.get(k);
    if (arr) arr.push(p);
    else byKey.set(k, [p]);
  }

  const out: EcomGroup[] = [];
  for (const [key, docs] of byKey) {
    // Vakil: e-com mazmuni eng boy (rasm, tavsif), keyin eng yangi tahrirlangan
    const rep = [...docs].sort((a, b) =>
      (b.ecomImages?.length ?? 0) - (a.ecomImages?.length ?? 0)
      || (b.ecomDescription ? 1 : 0) - (a.ecomDescription ? 1 : 0)
      || ts(b.updatedAt) - ts(a.updatedAt))[0];

    // Guruh tanlovi: aniq belgilangan eng yangi hujjat
    const withChoice = docs.filter((d) => typeof d.ecomListed === 'boolean').sort((a, b) => ts(b.updatedAt) - ts(a.updatedAt));
    const explicit = withChoice[0]?.ecomListed;

    // Namuna tovar avtomatik rejimda sotilmaydi: haqiqiy nusxa bo'lsa — faqat u; faqat namunadan iborat guruh —
    // yashirin (panelda narx/qoldig'i ko'rinadi, egasi «ko'rsatish» desa chiqadi)
    const real = docs.filter((d) => !isSampleItemCode(d.itemCode));
    const pool = explicit === true || real.length === 0 ? docs : real;
    const listed = resolveEcomListed(explicit, autoPublish && real.length > 0);

    const sell = pool.filter((d) => ecomAvailableQty(d) > 0);
    let qty = 0;
    for (const d of sell) qty = addQty(qty, ecomAvailableQty(d));
    const prices = sell.map((d) => d.salePrice);
    const price = prices.length ? Math.min(...prices) : 0;
    const maxPrice = prices.length ? Math.max(...prices) : 0;

    const hasPrice = docs.some((d) => d.salePrice > 0);
    const state: EcomGroupState = !hasPrice ? 'noPrice' : listed && qty > 0 ? 'live' : 'hidden';

    const repOld = rep.oldPrice && rep.oldPrice > price ? rep.oldPrice : undefined;
    out.push({
      key,
      name: rep.name,
      variantName: rep.variantName || undefined,
      color: rep.color || undefined,
      allIds: docs.map((d) => String(d._id)),
      sellIds: sell.map((d) => String(d._id)),
      qty,
      price,
      maxPrice,
      oldPrice: price > 0 && maxPrice === price ? repOld : undefined,
      unit: rep.unit || undefined,
      category: rep.category || undefined,
      brand: rep.brand || undefined,
      description: rep.ecomDescription || undefined,
      images: ecomImagesOf(rep),
      explicit,
      listed,
      state,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Kartochka nomi: «iPhone 15 · 128GB · qora» */
export function ecomDisplayName(g: Pick<EcomGroup, 'name' | 'variantName' | 'color'>): string {
  return [g.name, g.variantName, g.color].filter(Boolean).join(' · ');
}

export function isFractionalListing(unit?: string | null): boolean {
  return isFractionalUnit(unit);
}

/** Xaridor telefoni: faqat to'liq O'zbekiston raqami → «+998901234567», aks holda null */
export function buyerPhoneKey(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('998') ? digits.slice(3) : digits.length === 9 ? digits : null;
  if (!local || !/^[1-9]\d{8}$/.test(local)) return null;
  return `+998${local}`;
}

/**
 * Buyurtma miqdorini guruh hujjatlariga taqsimlash — eng arzonidan boshlab (narxlar har xil bo'lsa xaridor
 * «…dan» narxni ko'radi, jami esa haqiqiy narxlardan). Sanalmaydigan (IMEI) hujjat — 1 dona. Yetmasa — null.
 * `availableOf` — buyurtma berishda ecomAvailableQty, bajarishda orderAvailableQty.
 */
export function allocateCheapest<T extends EcomSourceProduct>(
  docs: T[], qty: number, availableOf: (p: T) => number = ecomAvailableQty,
): { doc: T; qty: number }[] | null {
  const sorted = [...docs].sort((a, b) => a.salePrice - b.salePrice);
  const out: { doc: T; qty: number }[] = [];
  let left = roundQ(qty);
  for (const d of sorted) {
    if (left <= 0) break;
    const avail = availableOf(d);
    if (avail <= 0) continue;
    if (!d.trackQuantity) {
      if (left < 1) continue;
      out.push({ doc: d, qty: 1 });
      left = roundQ(left - 1);
      continue;
    }
    const take = Math.min(avail, left);
    out.push({ doc: d, qty: roundQ(take) });
    left = roundQ(left - take);
  }
  return left > 0 ? null : out;
}

/** Taqsimot jami (so'm, butun): Σ narx × miqdor */
export function allocationTotal(allocs: { doc: Pick<EcomSourceProduct, 'salePrice'>; qty: number }[]): number {
  return allocs.reduce((s, a) => s + Math.round(a.doc.salePrice * a.qty), 0);
}

/** Jami summani ulushlarga bo'lish (butun so'm, qoldiq oxirgisiga) — sotuv yozuvlari yig'indisi aynan jamiga teng */
export function splitTotal(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (weights.length === 0) return [];
  if (sum <= 0) return weights.map((_, i) => (i === weights.length - 1 ? total : 0));
  const parts = weights.map((w) => Math.floor((total * w) / sum));
  parts[parts.length - 1] += total - parts.reduce((s, x) => s + x, 0);
  return parts;
}

function roundQ(n: number): number {
  return Math.round(n * 1000) / 1000;
}
