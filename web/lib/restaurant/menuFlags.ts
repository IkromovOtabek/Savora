/**
 * Restoran: menyu va ombor ajratilishi — `Product.menuItem` belgisi (docs/RESTORAN_API.md §2a).
 *
 * Qoida (isOnMenu / onMenuFilter — ikkalasi bir xil):
 *   menuItem === true  → menyuda (retseptli taom, xizmat yoki menyuga qo'shilgan tayyor tovar);
 *   menuItem === false → menyuda emas (xom ashyo; menyudan olingan taom);
 *   belgi yo'q         → turi bo'yicha: texkarta (bundle) va xizmat — menyuda, oddiy tovar — yo'q.
 * Shu tufayli umumiy mahsulot formasi, mobil yoki Excel orqali qo'shilgan texkarta menyudan «yo'qolmaydi»,
 * yangi xom ashyo esa menyuga o'zi chiqmaydi.
 *
 * Bir martalik migratsiya (ensureMenuFlags): do'konda `ShopSettings.menuVersion` < 1 bo'lsa, menyu birinchi
 * ochilganda (xodim/mijoz menyusi, Menyu va Ombor sahifalari) belgisi YO'Q mahsulotlarga belgi qo'yiladi:
 *   - texkarta va xizmat → true;
 *   - stansiyasi, modifikatori yoki stop-listi bor, yoxud restoran buyurtmasida sotilgan tovar → true;
 *   - qolgan tovar (xom ashyo) → false.
 * Belgisi bor mahsulotga tegilmaydi (takroriy yoki parallel ishga tushish egasining tanlovini buzmaydi), oxirida
 * `menuVersion = 1`. Migratsiyadan oldin yoki u xato bersa — eski xatti-harakat: filialning barcha sotuvdagi
 * mahsulotlari menyuda (buildMenu `flags === false`).
 */
import type { RestaurantModels } from './context';
import type { MenuSection } from './types';
import { logError } from '../logger';

export const MENU_VERSION = 1;
/** O'z qoldig'i yo'q turlar — standart bo'yicha menyuda, omborda ko'rinmaydi */
export const MENU_KINDS = ['bundle', 'service'] as const;

export type MenuFlagSource = { menuItem?: boolean | null; kind?: string | null };

/** Mahsulot menyudami (belgi yoki turi bo'yicha) */
export function isOnMenu(p: MenuFlagSource): boolean {
  if (p.menuItem === true) return true;
  if (p.menuItem === false) return false;
  return p.kind === 'bundle' || p.kind === 'service';
}

/**
 * Menyu bo'limi: belgilangan bo'lsa — o'sha; belgisi yo'q eski band — stansiyasi bar turida bo'lsa «bar», aks holda
 * «oshxona». `barStationIds` — filialning bar turidagi stansiyalari.
 */
export function menuSectionOf(
  p: { menuSection?: string | null; stationId?: unknown },
  barStationIds: ReadonlySet<string>,
): MenuSection {
  if (p.menuSection === 'bar' || p.menuSection === 'kitchen') return p.menuSection;
  return p.stationId && barStationIds.has(String(p.stationId)) ? 'bar' : 'kitchen';
}

/** isOnMenu'ning Mongo filtri (boshqa shartlar bilan `$and` ichida ishlating — ichida `$or` bor) */
export function onMenuFilter(): Record<string, unknown> {
  return { $or: [{ menuItem: true }, { menuItem: null, kind: { $in: MENU_KINDS } }] };
}

/** Restoran omboridagi mahsulotlar: faqat sanaladigan tovar (xom ashyo va tayyor tovar); taom/xizmat — Menyu'da */
export function stockOnlyFilter(): Record<string, unknown> {
  return { kind: { $nin: MENU_KINDS } };
}

type FlagModels = Pick<RestaurantModels, 'Product' | 'ShopSettings' | 'Order'>;

/** Migratsiyasi tugagan bazalar (jarayon ichida) — har so'rovda ShopSettings o'qilmasin */
const ready = new Set<string>();
const dbKey = (m: FlagModels): string => m.Product.db?.name ?? '';

/**
 * Belgilar tayyorligini ta'minlaydi (kerak bo'lsa — bir martalik migratsiya). `true` — belgi rejimi (menyu
 * `onMenuFilter` bo'yicha), `false` — migratsiya xato berdi: eski xatti-harakat (hamma sotuvdagi mahsulot menyuda).
 */
export async function ensureMenuFlags(m: FlagModels): Promise<boolean> {
  const key = dbKey(m);
  if (key && ready.has(key)) return true;
  try {
    const s = await m.ShopSettings.findOne({ key: 'main' }).select('menuVersion').lean();
    if ((s?.menuVersion ?? 0) < MENU_VERSION) await migrateMenuFlags(m);
    if (key) ready.add(key);
    return true;
  } catch (err) {
    logError('restaurant menu flags migration failed', err, { db: key });
    return false;
  }
}

/** Migratsiya (idempotent: faqat belgisi yo'q mahsulotlarga yozadi). Natija — nechtasi menyuga / omborga belgilandi */
export async function migrateMenuFlags(m: FlagModels): Promise<{ menu: number; stock: number }> {
  const unset = { menuItem: { $exists: false } };
  const ordered = (await m.Order.distinct('items.productId')).filter(Boolean);
  const kinds = await m.Product.updateMany({ ...unset, kind: { $in: MENU_KINDS } }, { $set: { menuItem: true } });
  const sold = await m.Product.updateMany(
    {
      ...unset,
      $or: [
        { stationId: { $exists: true } },
        { 'modifierGroups.0': { $exists: true } },
        { stopListed: true },
        ...(ordered.length ? [{ _id: { $in: ordered } }] : []),
      ],
    },
    { $set: { menuItem: true } },
  );
  const raw = await m.Product.updateMany(unset, { $set: { menuItem: false } });
  await m.ShopSettings.updateOne({ key: 'main' }, { $max: { menuVersion: MENU_VERSION } }, { upsert: true });
  return { menu: kinds.modifiedCount + sold.modifiedCount, stock: raw.modifiedCount };
}

/** Testlar uchun: jarayon keshini tozalash */
export function resetMenuFlagsCache(): void {
  ready.clear();
}
