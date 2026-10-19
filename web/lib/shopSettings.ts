import type { Model } from 'mongoose';
import type { IShopSettings } from './models/tenant/ShopSettings';

export type ShopSettings = Omit<IShopSettings, 'key' | 'createdAt' | 'updatedAt'>;

export const DEFAULT_SHOP_SETTINGS: ShopSettings = {
  receipt: { paperWidth: 80, showSeller: true, showCustomer: true },
  currency: { rateMode: 'cbu' },
  notify: { dailySummary: false, shiftDiff: true },
};

/** Saqlangan qiymatlarni standartlar ustiga qo'yadi (hujjat yo'q yoki eski bo'lsa ham to'liq obyekt) */
export function mergeShopSettings(doc?: Partial<ShopSettings> | null): ShopSettings {
  const d = DEFAULT_SHOP_SETTINGS;
  return {
    receipt: { ...d.receipt, ...stripUndef(doc?.receipt) },
    currency: { ...d.currency, ...stripUndef(doc?.currency) },
    notify: { ...d.notify, ...stripUndef(doc?.notify) },
    updatedBy: doc?.updatedBy,
  };
}

function stripUndef<T extends object>(o?: T): Partial<T> {
  if (!o) return {};
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)) as Partial<T>;
}

/** Do'kon sozlamalari (o'qish) — hujjat bo'lmasa standartlar */
export async function getShopSettings(M: Model<IShopSettings>): Promise<ShopSettings> {
  const doc = await M.findOne({ key: 'main' }).lean();
  return mergeShopSettings(doc);
}

/** Bitta bo'limni yangilash (upsert) */
export async function saveShopSettingsPart<K extends 'receipt' | 'currency' | 'notify'>(
  M: Model<IShopSettings>, part: K, value: Partial<ShopSettings[K]>, by: string,
): Promise<void> {
  // by bo'sh — avtomatik yangilanish (CBU kursi), oxirgi tahrirlovchi o'zgarmaydi
  const set: Record<string, unknown> = by ? { updatedBy: by } : {};
  for (const [k, v] of Object.entries(value)) set[`${part}.${k}`] = v;
  const unset: Record<string, ''> = {};
  for (const [k, v] of Object.entries(set)) if (v === undefined) { unset[k] = ''; delete set[k]; }
  await M.updateOne(
    { key: 'main' },
    { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}), $setOnInsert: { key: 'main' } },
    { upsert: true },
  );
}
