/**
 * Taom oshxonaga yuborilgandan keyin ombor ogohlantirishlari (server, DB). ops.sendItems → `after` ichida FONDA
 * chaqiriladi (notifyInBackground): yuborishni kutdirmaydi, xato yutiladi (log). Pre-chek/to'lov oldidan avtomatik
 * yuborish va QR tasdiqlash + yuborish ham sendItems orqali o'tadi.
 *
 *  - `lowStock` — yuborilgan taom retseptidagi xom ashyo (va tayyor tovarning o'zi) qoldig'i `Product.minStock` dan
 *    kam bo'lsa. Mahsulot bo'yicha 12 soatda bir marta (dedupe).
 *  - `dishLow` — shu xom ashyo ishlatiladigan menyudagi taomga porsiya ≤ `ShopSettings.restaurant.lowPortions`
 *    (standart 5, 0 — o'chiq) bo'lsa; 0 — «tugadi» (alohida kalit: «kam qoldi» dan keyin «tugadi» ham keladi).
 *    Porsiya — «Menyu» bo'limi (menuAdmin.ts → recipeStats) bilan bir xil: `portionsFrom` (recipeUnits.ts),
 *    qoldiq — `in_stock|sold` holatida getStockQty, boshqasi 0.
 * Kimga: do'kon egasi + filialdagi `product.edit` yoki `menu.stopList` egalari.
 */
import type { Types } from 'mongoose';
import type { IProduct, IBundleItem } from '../models/tenant/Product';
import { getShopSettings } from '../shopSettings';
import { getStockQty, isStockless } from '../productQuantity';
import { notify, type NotifyInput, type NotifyOrg } from '../notify';
import { isOnMenu } from './menuFlags';
import { portionsFrom } from './recipeUnits';
import { DEFAULT_RESTAURANT_SETTINGS } from './types';
import type { RestaurantModels } from './context';

type Lean = IProduct & { _id: Types.ObjectId };

const AUDIENCE: NotifyInput['audience'] = { admins: true, anyPermission: ['product.edit', 'menu.stopList'] };
const FIELDS = 'name unit kind trackQuantity quantity soldQuantity status minStock menuItem stopListed systemKey bundleItems';

/** Retsept/menyu uchun qoldiq (menuAdmin.ts → stockInfo bilan bir xil qoida) */
export function stockAvailable(p: Pick<IProduct, 'trackQuantity' | 'quantity' | 'soldQuantity' | 'status'> & { kind?: string | null }): number {
  return p.status === 'in_stock' || p.status === 'sold' ? getStockQty(p) : 0;
}

/** Taomga necha porsiya qoladi (menuAdmin.ts → recipeStats bilan bir xil) */
export function dishPortions(items: readonly IBundleItem[] | undefined, available: ReadonlyMap<string, number>): number {
  return portionsFrom((items ?? []).map((it) => ({ qty: it.qty, available: available.get(String(it.productId)) ?? 0 })));
}

export interface StockAlertResult {
  lowStock: string[];
  dishLow: { id: string; portions: number }[];
}

/**
 * Yuborilgan taomlar (`items`) bo'yicha tekshiruv. `org` — notify uchun; `m` — tenant modellar.
 * Natija — qaysi mahsulotlar uchun xabar so'raldi (dedupe tufayli yaratilmagan bo'lishi ham mumkin).
 */
export async function checkStockAfterSend(
  org: NotifyOrg,
  m: Pick<RestaurantModels, 'Product' | 'Branch' | 'ShopSettings'>,
  branchId: Types.ObjectId | string,
  items: readonly { productId: Types.ObjectId | string }[],
): Promise<StockAlertResult> {
  const out: StockAlertResult = { lowStock: [], dishLow: [] };
  const sentIds = [...new Set(items.map((i) => String(i.productId)))];
  if (!sentIds.length || !org.dbName) return out;
  const sent = await m.Product.find({ _id: { $in: sentIds }, branchId }).select(FIELDS).lean<Lean[]>();

  // Ombordan chiqqanlar: taom — retsept xom ashyosi, tayyor tovar — o'zi (xizmat — ombor o'zgarmaydi)
  const touched = new Set<string>();
  for (const p of sent) {
    if (p.kind === 'bundle') for (const it of p.bundleItems ?? []) touched.add(String(it.productId));
    else if (!isStockless(p)) touched.add(String(p._id));
  }
  if (!touched.size) return out;

  const [stockDocs, settings, branches] = await Promise.all([
    m.Product.find({ _id: { $in: [...touched] } }).select(FIELDS).lean<Lean[]>(),
    getShopSettings(m.ShopSettings),
    m.Branch.find({ active: true }).select('name').lean(),
  ]);
  const lowPortions = settings.restaurant?.lowPortions ?? DEFAULT_RESTAURANT_SETTINGS.lowPortions;
  const branchName = branches.length > 1 ? branches.find((b) => String(b._id) === String(branchId))?.name : undefined;
  const extra = branchName ? { branch: branchName } : {};
  const base = { branchId: String(branchId), audience: AUDIENCE };
  const available = new Map(stockDocs.map((p) => [String(p._id), stockAvailable(p)]));

  // 1) Minimal qoldiqdan kam
  const lowIds = new Set<string>();
  for (const p of stockDocs) {
    if (!p.trackQuantity || isStockless(p) || !(p.minStock && p.minStock > 0)) continue;
    const qty = available.get(String(p._id)) ?? 0;
    if (qty >= p.minStock) continue;
    lowIds.add(String(p._id));
    out.lowStock.push(String(p._id));
    await notify(org, {
      ...base,
      kind: 'lowStock',
      params: { product: p.name, qty, unit: p.unit ?? null, min: p.minStock, ...extra },
      url: '/app/products?low=1',
      dedupeKey: `lowStock:${String(p._id)}`,
    });
  }

  if (!(lowPortions > 0)) return out;

  // 2) Taomga oz porsiya qoldi: shu xom ashyo ishlatiladigan menyudagi taomlar (stop-listdagisiz)
  const dishes = (await m.Product.find({
    branchId,
    kind: 'bundle',
    status: 'in_stock',
    'bundleItems.productId': { $in: [...touched] },
    stopListed: { $ne: true },
    systemKey: { $exists: false },
  }).select(FIELDS).limit(300).lean<Lean[]>()).filter((p) => isOnMenu(p));
  const missing = [...new Set(dishes.flatMap((p) => (p.bundleItems ?? []).map((i) => String(i.productId))))].filter((id) => !available.has(id));
  if (missing.length) {
    const more = await m.Product.find({ _id: { $in: missing } }).select('trackQuantity quantity soldQuantity status kind').lean<Lean[]>();
    for (const p of more) available.set(String(p._id), stockAvailable(p));
  }
  const alerts: { id: string; name: string; portions: number }[] = dishes
    .map((p) => ({ id: String(p._id), name: p.name, portions: dishPortions(p.bundleItems, available) }));
  // Menyudagi tayyor tovar (ichimlik, non): porsiya = qoldiq (minimal qoldiq xabari bo'lsa — takrorlanmaydi)
  for (const p of stockDocs) {
    if (p.kind === 'bundle' || isStockless(p) || !sentIds.includes(String(p._id))) continue;
    if (!isOnMenu(p) || p.stopListed || lowIds.has(String(p._id))) continue;
    alerts.push({ id: String(p._id), name: p.name, portions: Math.floor(available.get(String(p._id)) ?? 0) });
  }
  for (const a of alerts) {
    if (a.portions > lowPortions) continue;
    out.dishLow.push({ id: a.id, portions: a.portions });
    await notify(org, {
      ...base,
      kind: 'dishLow',
      params: { dish: a.name, portions: a.portions, ...extra },
      url: '/app/menu',
      dedupeKey: `dishLow:${a.id}:${a.portions === 0 ? 'out' : 'low'}`,
    });
  }
  return out;
}
