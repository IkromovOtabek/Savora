import { Types, type Model } from 'mongoose';
import type { IProduct, ProductKind } from '@/lib/models/tenant/Product';
import { PRODUCT_KINDS } from '@/lib/models/tenant/Product';
import { getStockQty, isStockless } from '@/lib/productQuantity';
import { parseQty, roundQty } from '@/lib/qty';

/**
 * Mahsulot turlari (tovar / xizmat / to'plam) — sotuv ekranlari va yaratish uchun umumiy yordamchilar.
 * Ombor harakati: lib/stock.ts (reserveStock/releaseStock).
 */

/** Xizmatni sotishda «qoldiq» cheklovi yo'q — kassa/mobil uchun yetarlicha katta son */
export const SERVICE_AVAILABLE = 999_999;
export const BUNDLE_MAX_ITEMS = 30;

export function parseProductKind(raw: unknown): ProductKind {
  return (PRODUCT_KINDS as readonly string[]).includes(String(raw)) ? (raw as ProductKind) : 'goods';
}

type SellableSource = Pick<IProduct, 'trackQuantity' | 'quantity' | 'soldQuantity' | 'status'> & {
  _id: unknown;
  kind?: string | null;
  bundleItems?: { productId: unknown; qty: number }[] | null;
};

/** To'plam nechta yig'ilishi mumkin: har bir tarkib qoldig'i / 1 to'plamdagi miqdori — eng kichigi */
export function bundleAvailable(items: { productId: unknown; qty: number }[], stockById: Map<string, number>): number {
  if (!items.length) return 0;
  return Math.min(...items.map((it) => Math.floor(roundQty((stockById.get(String(it.productId)) ?? 0) / it.qty))));
}

/**
 * Sotuv ekranlari uchun: har mahsulotda `tracked` (miqdor kiritiladimi) va `available` (nechta sotsa bo'ladi).
 * To'plamlar tarkibi bitta qo'shimcha so'rov bilan o'qiladi.
 */
export async function sellableInfo(
  Product: Model<IProduct>,
  products: SellableSource[],
): Promise<(p: SellableSource) => { tracked: boolean; available: number }> {
  const componentIds = [...new Set(products.flatMap((p) => (p.kind === 'bundle' ? (p.bundleItems ?? []).map((i) => String(i.productId)) : [])))];
  const stockById = new Map<string, number>();
  if (componentIds.length) {
    const comps = await Product.find({ _id: { $in: componentIds } }, { trackQuantity: 1, quantity: 1, soldQuantity: 1, status: 1, kind: 1 }).lean();
    for (const c of comps) stockById.set(String(c._id), c.status === 'in_stock' ? getStockQty(c) : 0);
  }
  return (p) => {
    if (p.kind === 'service') return { tracked: true, available: SERVICE_AVAILABLE };
    if (p.kind === 'bundle') return { tracked: true, available: bundleAvailable(p.bundleItems ?? [], stockById) };
    return { tracked: !!p.trackQuantity, available: getStockQty(p) };
  };
}

export type BundleParse =
  | { ok: true; items: { productId: Types.ObjectId; qty: number }[]; cost: number }
  | { ok: false; error: string };

/**
 * To'plam tarkibi: [{ productId, qty }]. Har biri — shu filialdagi, sotuvdagi, sanaladigan oddiy tovar.
 * `cost` — tarkib kelish narxlari yig'indisi (to'plam tannarxi).
 */
export async function parseBundleItems(
  Product: Model<IProduct>,
  raw: unknown,
  branchId: string | Types.ObjectId,
  msg: { empty: string; invalid: string; tooMany: string; notFound: string; notCountable: string },
): Promise<BundleParse> {
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try { list = JSON.parse(raw || '[]'); } catch { return { ok: false, error: msg.invalid }; }
  }
  if (!Array.isArray(list) || !list.length) return { ok: false, error: msg.empty };
  if (list.length > BUNDLE_MAX_ITEMS) return { ok: false, error: msg.tooMany };

  const wanted = new Map<string, unknown>();
  for (const r of list as Record<string, unknown>[]) {
    const id = String(r?.productId ?? '');
    if (!Types.ObjectId.isValid(id)) return { ok: false, error: msg.invalid };
    if (wanted.has(id)) return { ok: false, error: msg.invalid };
    wanted.set(id, r?.qty);
  }

  const found = await Product.find(
    { _id: { $in: [...wanted.keys()] }, branchId, status: 'in_stock' },
    { name: 1, kind: 1, trackQuantity: 1, unit: 1, purchasePrice: 1 },
  ).lean();
  if (found.length !== wanted.size) return { ok: false, error: msg.notFound };

  const items: { productId: Types.ObjectId; qty: number }[] = [];
  let cost = 0;
  for (const p of found) {
    if (isStockless(p) || !p.trackQuantity) return { ok: false, error: msg.notCountable.replace('{name}', p.name) };
    const qty = parseQty(wanted.get(String(p._id)) as string | number, p.unit);
    if (qty === null) return { ok: false, error: msg.invalid };
    items.push({ productId: p._id, qty });
    cost += Math.round((p.purchasePrice ?? 0) * qty);
  }
  return { ok: true, items, cost };
}

/**
 * To'plam formasi uchun tanlov ro'yxati: shu ombordagi sanaladigan tovarlar
 * (+ tahrirda mavjud tarkib — qoldig'i tugagan bo'lsa ham nomi ko'rinsin).
 * Kelish narxini ko'rish huquqi bo'lmasa — 0 (brauzerga sizib chiqmasin).
 */
export async function loadBundleCandidates(
  Product: Model<IProduct>,
  branchId: string | Types.ObjectId,
  opts: { includeIds?: string[]; canViewCost: boolean },
) {
  const include = (opts.includeIds ?? []).filter((id) => Types.ObjectId.isValid(id));
  const docs = await Product.find(
    {
      $or: [
        { branchId, status: 'in_stock', trackQuantity: true, kind: { $nin: ['service', 'bundle'] } },
        ...(include.length ? [{ _id: { $in: include } }] : []),
      ],
    },
    { name: 1, unit: 1, trackQuantity: 1, quantity: 1, soldQuantity: 1, status: 1, purchasePrice: 1, kind: 1 },
  ).sort({ name: 1 }).limit(1000).lean();
  return docs.map((p) => ({
    id: String(p._id),
    name: p.name,
    unit: p.unit ?? null,
    available: p.status === 'in_stock' ? getStockQty(p) : 0,
    purchasePrice: opts.canViewCost ? p.purchasePrice ?? 0 : 0,
  }));
}
