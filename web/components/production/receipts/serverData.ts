/**
 * Kirim va xarid sahifalari uchun server yordamchilari (faqat o'qish): yetkazib beruvchilar ro'yxati,
 * hujjat qatorlaridagi tovarlarning birlik ma'lumoti (xarid birligi — qatorda birlik tanlovi uchun),
 * URL parametrlari. Server komponentlardan chaqiriladi; lib/production/* o'zgartirilmaydi.
 */
import type { ProductionCtx } from '@/lib/production/context';
import type { ProductUnit } from '@/lib/businessTypes';
import { roundQty } from '@/lib/qty';
import { tashkentDayKey, tashkentDayStart } from '@/lib/period';
import { productOptions } from '@/lib/production/catalog';
import { toLineProduct, type LineProduct, type PrefillItem } from './lines';

export const isId = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);

/**
 * Davr filtri kuni: YYYY-MM-DD → Toshkent kuni boshi (UTC+5) yoki undefined. `to` sifatida berilsa backend
 * (dateRange) shu kun oxirigacha oladi.
 */
export function dayParam(v?: string): Date | undefined {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const dt = tashkentDayStart(v);
  return Number.isNaN(dt.getTime()) || tashkentDayKey(dt) !== v ? undefined : dt;
}

/**
 * «Kam qolgan» blokidan kelgan `?items=a,b,c` → formani oldindan to'ldirish (GET /api/production/products?ids= bilan bir
 * xil backend): tovar va yetmagan miqdor (minStock − qoldiq, asosiy birlikda). Noto'g'ri/ko'rinmaydigan id — tashlanadi.
 */
export async function prefillFromIds(ctx: ProductionCtx, raw?: string): Promise<PrefillItem[]> {
  const ids = [...new Set((raw ?? '').split(',').map((x) => x.trim()).filter(isId))].slice(0, 50);
  if (!ids.length) return [];
  const r = await productOptions(ctx, { ids });
  if (!r.ok) return [];
  return r.data.items.map((o) => ({
    product: toLineProduct(o),
    shortage: Math.max(0, roundQty((o.minStock ?? 0) - o.available)),
  }));
}

export async function supplierOptions(ctx: ProductionCtx): Promise<{ id: string; name: string }[]> {
  const list = await ctx.m.Supplier.find({}, { name: 1 }).sort({ name: 1 }).limit(500).lean();
  return list.map((s) => ({ id: String(s._id), name: s.name }));
}

interface LineLike { productId: string; code: string; name: string; unit: ProductUnit | null; factor: number; baseUnit: ProductUnit | null }

/**
 * Hujjat qatorlari tovarlari: hozirgi xarid birligi/koeffitsienti va qoldiq. Tovarning xarid birligi keyin olib
 * tashlangan bo'lsa — qatordagi birlik va koeffitsient saqlanadi (qator buzilmasin).
 */
export async function lineProductsFor(ctx: ProductionCtx, lines: readonly LineLike[]): Promise<Record<string, LineProduct>> {
  const ids = [...new Set(lines.map((l) => l.productId))].filter(isId);
  const docs = ids.length
    ? await ctx.m.Product.find({ _id: { $in: ids } })
        .select('unit purchaseUnit purchaseFactor barcode quantity soldQuantity status')
        .lean()
    : [];
  const byId = new Map(docs.map((p) => [String(p._id), p]));
  const out: Record<string, LineProduct> = {};
  for (const l of lines) {
    const p = byId.get(l.productId);
    const base = (p?.unit ?? l.baseUnit ?? 'dona') as ProductUnit;
    const lineIsPurchase = !!l.unit && l.unit !== base;
    const purchaseUnit = (p?.purchaseUnit ?? (lineIsPurchase ? l.unit : null)) as ProductUnit | null;
    const purchaseFactor = p?.purchaseFactor ?? (lineIsPurchase ? l.factor : null);
    // Qatordagi birlik tovarning hozirgi xarid birligidan farq qilsa — qatornikini ko'rsatamiz
    const keepLine = lineIsPurchase && purchaseUnit !== l.unit;
    out[l.productId] = {
      id: l.productId,
      code: l.code,
      name: l.name,
      unit: base,
      purchaseUnit: keepLine ? l.unit : purchaseUnit,
      purchaseFactor: keepLine ? l.factor : purchaseFactor,
      available: p ? (p.status === 'in_stock' ? Math.max(0, roundQty((p.quantity ?? 0) - (p.soldQuantity ?? 0))) : 0) : null,
      barcode: p?.barcode ?? null,
      cost: null,
    };
  }
  return out;
}
