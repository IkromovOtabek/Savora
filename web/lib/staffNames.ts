/**
 * Xodimning ko'rinadigan ismi: chek, oshxona ekrani (KDS), pre-chek, zal taxtasi, hisobotlarda login
 * (`dr_ofitsant`) o'rniga `User.fullName` («Aziz»). Bazada login saqlanadi (Sale.soldBy, Order.waiterName,
 * items.addedBy/voidedBy …) — o'zgarmaydi; ism faqat ko'rsatishda almashtiriladi. Login topilmasa
 * (o'chirilgan/qayta nomlangan) — login o'zi ko'rsatiladi.
 */
import type { Model } from 'mongoose';
import type { IUser } from './models/tenant/User';

export interface StaffNames {
  /** User _id → ism */
  byId: Map<string, string>;
  /** login → ism */
  byLogin: Map<string, string>;
}

/** Bitta do'kondagi loginlar soni kichik (tarif ≤ 999) — bitta yengil so'rov bilan hammasi o'qiladi */
const MAX_USERS = 2000;

export function displayNameOf(u: { fullName?: string | null; username: string }): string {
  return u.fullName?.trim() || u.username;
}

/** Do'kon loginlari: id/login → ism. Faqat `username fullName` o'qiladi */
export async function loadStaffNames(User: Model<IUser>): Promise<StaffNames> {
  const users = await User.find().select('username fullName').limit(MAX_USERS).lean();
  const byId = new Map<string, string>();
  const byLogin = new Map<string, string>();
  for (const u of users) {
    const name = displayNameOf(u);
    byId.set(String(u._id), name);
    byLogin.set(u.username, name);
  }
  return { byId, byLogin };
}

/** Login (va ixtiyoriy id) bo'yicha ism; topilmasa — login o'zi (bo'sh bo'lsa null) */
export function staffName(names: StaffNames | null | undefined, login?: string | null, id?: unknown): string | null {
  if (names && id !== undefined && id !== null && id !== '') {
    const byId = names.byId.get(String(id));
    if (byId) return byId;
  }
  if (!login) return null;
  return names?.byLogin.get(login) ?? login;
}

/**
 * Chek uchun: `soldBy` (login) → sotuvchining ismi. Faqat chekdagi loginlar o'qiladi.
 * Bazadagi Sale o'zgarmaydi — faqat ko'rsatiladigan nusxa.
 */
export async function withSellerNames<T extends { soldBy?: string | null }>(User: Model<IUser>, sales: T[]): Promise<T[]> {
  const logins = [...new Set(sales.map((s) => s.soldBy).filter((x): x is string => !!x))];
  if (!logins.length) return sales;
  const users = await User.find({ username: { $in: logins } }).select('username fullName').lean();
  const byLogin = new Map(users.map((u) => [u.username, displayNameOf(u)]));
  return sales.map((s) => (s.soldBy && byLogin.has(s.soldBy) ? { ...s, soldBy: byLogin.get(s.soldBy)! } : s));
}
