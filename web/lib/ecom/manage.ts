import { Types, type Model } from 'mongoose';
import type { IProduct } from '../models/tenant/Product';
import type { IShopSettings } from '../models/tenant/ShopSettings';
import { getShopSettings } from '../shopSettings';
import { isTenantUploadUrl } from '../fileUrl';
import { recordAudit } from '../audit';
import { ECOM_DESC_MAX, ECOM_MAX_IMAGES, ecomGroupKey, isEcomGroupKey, type EcomGroup } from './group';
import { loadEcomGroups } from './sync';

/**
 * Biznes egasi tomoni: e-commerce vitrinasini boshqarish (web action va mobil API umumiy).
 * Hamma o'zgarish guruhning BARCHA hujjatlariga yoziladi (bir xil tovarning nusxalari bir xil ko'rinsin).
 * Katalog yangilanishi — Product ilgagi orqali avtomatik (lib/ecom/dirty.ts).
 */

type Models = { Product: Model<IProduct>; ShopSettings: Model<IShopSettings> };
type Actor = { username: string; role: 'admin' | 'user' | 'super_admin'; dbName?: string };

export async function shopEcomGroups(m: Models): Promise<{ groups: EcomGroup[]; autoPublish: boolean; note?: string }> {
  const settings = await getShopSettings(m.ShopSettings);
  const autoPublish = settings.ecom?.autoPublish !== false;
  return { groups: await loadEcomGroups(m.Product, autoPublish), autoPublish, note: settings.ecom?.note };
}

export async function findEcomGroup(m: Models, key: string): Promise<{ group: EcomGroup; autoPublish: boolean } | null> {
  if (!isEcomGroupKey(key)) return null;
  const { groups, autoPublish } = await shopEcomGroups(m);
  const group = groups.find((g) => g.key === key);
  return group ? { group, autoPublish } : null;
}

const oid = (ids: string[]) => ids.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));

/** Ko'rsatish/yashirish: true/false — qo'lda; null — avtomatik (do'kon sozlamasi) */
export async function setEcomListed(m: Models, actor: Actor, keys: string[], listed: boolean | null): Promise<number> {
  const want = new Set(keys.filter(isEcomGroupKey).slice(0, 500));
  if (want.size === 0) return 0;
  const { groups } = await shopEcomGroups(m);
  const ids = groups.filter((g) => want.has(g.key)).flatMap((g) => g.allIds);
  if (ids.length === 0) return 0;
  await m.Product.updateMany(
    { _id: { $in: oid(ids) } },
    listed === null ? { $unset: { ecomListed: '' } } : { $set: { ecomListed: listed } },
  );
  await recordAudit(actor, {
    action: 'ecom.listed', entity: 'product',
    summary: `E-commerce: ${want.size} ta tovar — ${listed === null ? 'avtomatik' : listed ? "ko'rsatiladi" : 'yashirildi'}`,
  });
  return want.size;
}

export type EcomEditInput = {
  name?: unknown;
  salePrice?: unknown;
  oldPrice?: unknown;
  description?: unknown;
  images?: unknown;
  /** 'auto' | 'show' | 'hide' */
  listed?: unknown;
};
export type EcomEditError = 'notFound' | 'badName' | 'badPrice' | 'badOldPrice' | 'badDescription' | 'badImages';
export type EcomEditResult = { ok: true; key: string } | { ok: false; error: EcomEditError };

function intMoney(v: unknown): number | null {
  const s = String(v ?? '').replace(/[\s,]/g, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 && n <= 10_000_000_000 ? n : NaN;
}

export async function applyEcomEdit(m: Models, actor: Actor & { dbName: string }, key: string, input: EcomEditInput): Promise<EcomEditResult> {
  const found = await findEcomGroup(m, key);
  if (!found) return { ok: false, error: 'notFound' };
  const g = found.group;

  const name = input.name === undefined ? g.name : String(input.name).trim().replace(/\s+/g, ' ');
  if (!name || name.length > 200) return { ok: false, error: 'badName' };

  const salePrice = input.salePrice === undefined ? null : intMoney(input.salePrice);
  if (Number.isNaN(salePrice)) return { ok: false, error: 'badPrice' };
  const oldPrice = input.oldPrice === undefined ? undefined : intMoney(input.oldPrice);
  if (Number.isNaN(oldPrice)) return { ok: false, error: 'badOldPrice' };
  const effPrice = salePrice ?? g.price;
  if (oldPrice != null && oldPrice > 0 && oldPrice <= effPrice) return { ok: false, error: 'badOldPrice' };

  const description = input.description === undefined ? undefined : String(input.description).trim();
  if (description !== undefined && description.length > ECOM_DESC_MAX) return { ok: false, error: 'badDescription' };

  let images: string[] | undefined;
  if (input.images !== undefined) {
    const raw = Array.isArray(input.images) ? input.images : [];
    images = [...new Set(raw.map((u) => String(u ?? '').trim()).filter(Boolean))];
    if (images.length > ECOM_MAX_IMAGES || images.some((u) => !isTenantUploadUrl(u, actor.dbName))) {
      return { ok: false, error: 'badImages' };
    }
  }
  const listed = input.listed === 'show' ? true : input.listed === 'hide' ? false : input.listed === 'auto' ? null : undefined;

  const set: Record<string, unknown> = {};
  const unset: Record<string, ''> = {};
  const history: { action: 'edited' | 'revalued'; detail: string; by: string; at: Date }[] = [];
  const now = new Date();
  if (name !== g.name) {
    set.name = name;
    history.push({ action: 'edited', detail: `E-commerce: nom «${name}»`, by: actor.username, at: now });
  }
  // Narx o'zgarmagan bo'lsa tegilmaydi (guruhda narxlar har xil bo'lsa ham — har dona o'z narxida qoladi)
  if (salePrice !== null && salePrice !== undefined && salePrice !== g.price) {
    set.salePrice = salePrice;
    history.push({ action: 'revalued', detail: `E-commerce: sotish narxi ${salePrice.toLocaleString('uz-UZ')} so'm`, by: actor.username, at: now });
  }
  if (oldPrice !== undefined) {
    if (oldPrice && oldPrice > 0) set.oldPrice = oldPrice;
    else unset.oldPrice = '';
  }
  if (description !== undefined) {
    if (description) set.ecomDescription = description;
    else unset.ecomDescription = '';
  }
  if (images !== undefined) {
    if (images.length) set.ecomImages = images;
    else unset.ecomImages = '';
  }
  if (listed !== undefined) {
    if (listed === null) unset.ecomListed = '';
    else set.ecomListed = listed;
  }

  const update: Record<string, unknown> = {};
  if (Object.keys(set).length) update.$set = set;
  if (Object.keys(unset).length) update.$unset = unset;
  if (history.length) update.$push = { history: { $each: history } };
  if (Object.keys(update).length) {
    await m.Product.updateMany({ _id: { $in: oid(g.allIds) } }, update);
    await recordAudit(actor, {
      action: 'ecom.edit', entity: 'product',
      summary: `E-commerce tahrir: ${name}${set.salePrice !== undefined ? ` · ${Number(set.salePrice).toLocaleString('uz-UZ')} so'm` : ''}`,
    });
  }
  return { ok: true, key: ecomGroupKey({ name, variantName: g.variantName, color: g.color }) };
}
