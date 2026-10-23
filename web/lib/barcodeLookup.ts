import type { Model } from 'mongoose';
import type { IProduct } from '@/lib/models/tenant/Product';
import { logError } from '@/lib/logger';
import { getMasterModels } from '@/lib/masterDb';

/**
 * Shtrix-kod bo'yicha mahsulot nomini topish (yangi mahsulot formasi uchun):
 *  1) do'konning o'z bazasi — shu kodli mahsulot bor bo'lsa, takror yaratilmasin deb ogohlantiriladi;
 *  2) umumiy Savora lug'ati — boshqa do'konlar shu kodga bergan nom (master `barcode_catalog`);
 *  3) Open Food Facts ochiq bazasi — oziq-ovqat, ichimlik, kosmetika (EAN/UPC kodlar).
 * Tashqi xizmatga faqat shtrix-kod raqami yuboriladi (do'kon yoki mijoz ma'lumoti emas).
 */

export interface BarcodeExisting { id: string; name: string; status: string }
export interface BarcodeSuggestion { name: string; brand: string | null; source: 'savora' | 'openfoodfacts' }
export interface BarcodeLookupResult { existing: BarcodeExisting | null; suggestion: BarcodeSuggestion | null }

/** EAN-8, UPC-A (12), EAN-13, GTIN-14 — faqat raqam */
export function isRetailBarcode(code: string): boolean {
  return /^(\d{8}|\d{12,14})$/.test(code);
}

/** GTIN nazorat raqami (oxirgi raqam) to'g'rimi — noto'g'ri kodni tashqi bazaga yubormaymiz */
export function hasValidGtinCheckDigit(code: string): boolean {
  if (!isRetailBarcode(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  // O'ngdan chapga: 3, 1, 3, 1 …
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * Do'konlararo bir xil mahsulotni bildiradigan kodmi. Ichki kodlar (tarozi yorlig'i, do'konning o'z
 * stikeri: EAN-13 2xx/02x/04x, UPC-A 2/4, EAN-8 0/2) har do'konda boshqa tovar — lug'atga tushmaydi.
 */
export function isSharedBarcode(code: string): boolean {
  if (!hasValidGtinCheckDigit(code)) return false;
  if (code.length === 13) return !/^(2|02|04)/.test(code);
  if (code.length === 12) return !/^[24]/.test(code);
  if (code.length === 8) return !/^[02]/.test(code);
  return true;
}

export function catalogNameKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Ovozlar (yangisi birinchi) → eng ko'p do'kon bergan nom; teng bo'lsa — yaqinda yozilgani */
export function pickCatalogName(rows: { name: string; nameKey: string }[]): string | null {
  const votes = new Map<string, { name: string; n: number }>();
  for (const r of rows) {
    const v = votes.get(r.nameKey);
    if (v) v.n++;
    else votes.set(r.nameKey, { name: r.name, n: 1 });
  }
  let best: { name: string; n: number } | null = null;
  for (const v of votes.values()) if (!best || v.n > best.n) best = v;
  return best?.name ?? null;
}

async function fromSharedCatalog(code: string): Promise<BarcodeSuggestion | null> {
  try {
    const { BarcodeCatalog } = await getMasterModels();
    const rows = await BarcodeCatalog.find({ code }, { name: 1, nameKey: 1 }).sort({ updatedAt: -1 }).limit(50).lean();
    const name = pickCatalogName(rows);
    return name ? { name, brand: null, source: 'savora' } : null;
  } catch (err) {
    logError('barcodeLookup.catalog', err);
    return null;
  }
}

/**
 * Saqlangan mahsulot nomini umumiy lug'atga yozadi (do'kon ovozi yangilanadi). Xato bo'lsa ham
 * mahsulot saqlash oqimi buzilmaydi — faqat log.
 */
export async function rememberBarcodeNames(
  organizationId: unknown,
  items: { code?: string | null; name?: string | null }[],
): Promise<void> {
  if (!organizationId) return;
  const rows = items
    .map((i) => ({
      code: String(i.code ?? '').replace(/\s/g, ''),
      name: String(i.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
    }))
    .filter((r) => r.name.length >= 2 && isSharedBarcode(r.code));
  if (!rows.length) return;
  try {
    const { BarcodeCatalog } = await getMasterModels();
    await BarcodeCatalog.bulkWrite(rows.map((r) => ({
      updateOne: {
        filter: { code: r.code, organizationId },
        update: { $set: { name: r.name, nameKey: catalogNameKey(r.name) } },
        upsert: true,
      },
    })), { ordered: false });
  } catch (err) {
    logError('barcodeLookup.remember', err);
  }
}

/** OFF javobidan nom: mahalliy til → umumiy nom, hajmi bilan ("Pepsi 1.5 l") */
export function offProductName(p: Record<string, unknown>): string | null {
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = typeof p[k] === 'string' ? (p[k] as string).trim() : '';
      if (v) return v;
    }
    return '';
  };
  const base = pick('product_name_uz', 'product_name_ru', 'product_name', 'product_name_en', 'generic_name');
  if (!base) return null;
  const qty = pick('quantity');
  const name = qty && !base.toLowerCase().includes(qty.toLowerCase()) ? `${base} ${qty}` : base;
  return name.replace(/\s+/g, ' ').slice(0, 120);
}

const OFF_TIMEOUT_MS = 3500;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 2000;
/** Kod → taklif (topilmagani ham keshlanadi — bir kodni qayta-qayta so'ramaslik uchun) */
const cache = new Map<string, { at: number; value: BarcodeSuggestion | null }>();

async function fromOpenFoodFacts(code: string): Promise<BarcodeSuggestion | null> {
  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  let value: BarcodeSuggestion | null = null;
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_uz,product_name_ru,product_name_en,generic_name,brands,quantity`;
    const res = await fetch(url, {
      // OFF qoidasi: ilova nomini User-Agent'da ko'rsatish
      headers: { 'User-Agent': 'Savora/1.0 (https://savora.uz)' },
      signal: AbortSignal.timeout(OFF_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (res.ok) {
      const data = (await res.json()) as { status?: number; product?: Record<string, unknown> };
      if (data.status === 1 && data.product) {
        const name = offProductName(data.product);
        const brand = typeof data.product.brands === 'string' ? data.product.brands.split(',')[0].trim().slice(0, 60) : '';
        if (name) value = { name, brand: brand || null, source: 'openfoodfacts' };
      }
    } else if (res.status !== 404) {
      return null; // vaqtinchalik xato — keshlamaymiz
    }
  } catch (err) {
    // Tarmoq/timeout — forma baribir ishlaydi, faqat taklif bo'lmaydi
    if (!(err instanceof Error && err.name === 'TimeoutError')) logError('barcodeLookup.off', err);
    return null;
  }

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(code, { at: Date.now(), value });
  return value;
}

/** `scope` — filial doirasi (branchFilter): filial xodimi boshqa filial mahsulotini ko'rmaydi */
export async function lookupBarcode(
  Product: Model<IProduct>,
  rawCode: string,
  scope: Record<string, unknown> = {},
): Promise<BarcodeLookupResult> {
  const code = String(rawCode ?? '').replace(/\s/g, '').slice(0, 64);
  if (!code) return { existing: null, suggestion: null };

  // Sotilganlar ham hisobga olinadi — bir xil kodli ikkinchi kartochka ochilmasin
  const own = await Product.findOne({ ...scope, $or: [{ barcode: code }, { imei: code }] }, { name: 1, status: 1 })
    .sort({ status: 1, createdAt: -1 })
    .lean();
  if (own) return { existing: { id: String(own._id), name: own.name, status: own.status }, suggestion: null };

  // Ichki kod (tarozi yorlig'i va h.k.) har do'konda boshqa tovar — tashqi nom noto'g'ri bo'ladi
  if (!isSharedBarcode(code)) return { existing: null, suggestion: null };
  // Mahalliy do'konlar bergan nom ustun (o'zbekcha/ruscha, bozordagi nomi bilan); bo'lmasa — OFF
  const suggestion = (await fromSharedCatalog(code)) ?? (await fromOpenFoodFacts(code));
  return { existing: null, suggestion };
}
