import { Types } from 'mongoose';
import type { SessionUser } from '@/lib/session';
import type { getTenantModels } from '@/lib/tenantDb';
import type { PermissionKey } from '@/lib/permissions';
import { branchFilter } from '@/lib/branchScope';
import { isPhoneShop } from '@/lib/businessTypes';
import { getShopSettings } from '@/lib/shopSettings';
import { getStockQty } from '@/lib/productQuantity';
import { tashkentDayKey } from '@/lib/period';
import { labelCodeOf, resolveLabelSettings, type LabelItem, type LabelSettings } from './settings';

/**
 * Yorliq ma'lumoti — web (app/actions/labels.ts) va mobil API (/api/mobile/labels) uchun YAGONA manba:
 * huquq doirasi, filial cheklovi va mahsulot → LabelItem bir joyda.
 */

/** Bir chop etishda eng ko'p mahsulot (Excel importi natijasi ham shu orqali) */
export const LABEL_MAX_IDS = 500;

type Models = Awaited<ReturnType<typeof getTenantModels>>;

/**
 * Kim qaysi tovarning yorlig'ini ola oladi: «Omborni ko'rish» — hammasi; u bo'lmasa «Mahsulot qo'shish» bilan
 * faqat o'zi qo'shganlari (yangi qo'shilgan tovar kartochkasi kabi). Ikkalasi ham yo'q — null (rad).
 */
export function labelScope(
  user: Pick<SessionUser, 'username'>,
  perms: ReadonlySet<PermissionKey>,
): Record<string, string> | null {
  if (perms.has('products.view')) return {};
  if (perms.has('product.create')) return { createdBy: user.username };
  return null;
}

/** Faqat haqiqiy ObjectId'lar, takrorsiz, chegara bilan */
export function cleanLabelIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && Types.ObjectId.isValid(id)))].slice(0, LABEL_MAX_IDS);
}

export interface LabelDataResult {
  settings: LabelSettings;
  shopName: string;
  /** So'ralgan tartibda; topilmagan / ruxsatsiz tovarlar tushib qoladi */
  items: LabelItem[];
}

/** Tanlangan tovarlar + do'kon yorliq sozlamasi. Filial xodimi — faqat o'z filiali. */
export async function loadLabelData(
  ctx: {
    user: Pick<SessionUser, 'role' | 'branchId'>;
    org: { name: string; businessType?: string };
    scope: Record<string, string>;
    Product: Models['Product'];
    ShopSettings: Models['ShopSettings'];
  },
  ids: string[],
): Promise<LabelDataResult> {
  const { user, org, scope, Product, ShopSettings } = ctx;
  const phoneShop = isPhoneShop(org);
  const [shop, docs] = await Promise.all([
    getShopSettings(ShopSettings),
    ids.length
      ? Product.find({ _id: { $in: ids }, ...branchFilter(user), ...scope })
          .select('name imei imeiPending barcode productId kind salePrice color deviceModel size warrantyMonths createdAt trackQuantity quantity soldQuantity status')
          .lean()
      : Promise.resolve([]),
  ]);
  const byId = new Map(docs.map((p) => [String(p._id), p]));
  const items: LabelItem[] = [];
  for (const id of ids) {
    const p = byId.get(id);
    if (!p) continue;
    const { code, codeKind } = labelCodeOf(p, phoneShop);
    const attrs = [p.color, p.deviceModel, p.size].filter((x): x is string => !!x?.trim()).join(' · ');
    items.push({
      id,
      name: p.name,
      code,
      codeKind,
      price: p.salePrice ?? 0,
      productId: p.productId,
      attrs: attrs || undefined,
      warrantyMonths: p.warrantyMonths || undefined,
      date: p.createdAt ? tashkentDayKey(new Date(p.createdAt)) : undefined,
      imeiPending: phoneShop && !!p.imeiPending && (p.kind ?? 'goods') === 'goods' ? true : undefined,
      available: p.trackQuantity ? getStockQty(p) : 1,
    });
  }
  return { settings: resolveLabelSettings(shop.label, phoneShop), shopName: org.name, items };
}
