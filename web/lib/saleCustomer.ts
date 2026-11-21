import { Types } from 'mongoose';
import type { getTenantModels } from './tenantDb';
import { canonicalPhone } from './phone';
import { findCustomerByPhone } from './daftarOps';
import { escapeRegExp } from './security';

/**
 * Sotuvdagi mijoz: qidiruv (F.I.O katagidagi takliflar) va sotuvga bog'lash.
 * Sotuv formasi (createSaleAction) va ro'yxatdagi «Sotildi» (quickMarkSoldAction) uchun umumiy.
 */

type CustomerModels = Pick<Awaited<ReturnType<typeof getTenantModels>>, 'Customer'>;

export interface SaleCustomerHit { id: string; name: string; phone: string }
export interface SaleCustomerSearch { hits: SaleCustomerHit[]; more: boolean }

/** Bir so'rovda eng ko'p taklif (qolgani — qidiruv bilan) */
export const CUSTOMER_PICK_LIMIT = 30;
const QUERY_MAX = 50;

/** O'zbekcha apostrof turlari (o', o‘, oʻ, g'…) qidiruvda bir-biriga teng */
const APOS_RE = /['‘’ʻʼ`´]/g;
const APOS_CLASS = "['‘’ʻʼ`´]";

/** Faqat raqam/ajratgichlardan iborat va 3+ raqam — telefon bo'yicha qidiruv */
export function isPhoneQuery(q: string): boolean {
  return /^[\d\s+()-]+$/.test(q) && q.replace(/\D/g, '').length >= 3;
}

/** F.I.O so'zlari (tartibi ixtiyoriy: «vali ali» → «Aliyev Vali»), ko'pi bilan 4 ta */
export function nameWords(q: string): string[] {
  return q.trim().slice(0, QUERY_MAX).split(/\s+/).filter(Boolean).slice(0, 4);
}

/** Bitta so'z uchun regex manbasi: ekranlangan, apostroflar bir xil */
export function wordPattern(w: string): string {
  return escapeRegExp(w).replace(APOS_RE, APOS_CLASS);
}

/**
 * Bo'sh so'rov — so'nggi mijozlar («hammasidan tanlash»), ism — har bir so'z F.I.O ichida,
 * raqam — telefonning oxirgi 9 raqami (eski yozuvlar turli formatda saqlangan).
 */
export async function searchSaleCustomers(m: CustomerModels, raw: unknown, limit = CUSTOMER_PICK_LIMIT): Promise<SaleCustomerSearch> {
  const q = typeof raw === 'string' ? raw.trim().slice(0, QUERY_MAX) : '';
  let filter: Record<string, unknown> = {};
  if (q && isPhoneQuery(q)) {
    filter = { phone: { $regex: q.replace(/\D/g, '').slice(-9).split('').join('\\D*') } };
  } else if (q) {
    filter = { $and: nameWords(q).map((w) => ({ fullName: { $regex: wordPattern(w), $options: 'i' } })) };
  }
  const list = await m.Customer.find(filter).sort({ updatedAt: -1, _id: -1 }).limit(limit + 1).select('fullName phone').lean();
  return {
    hits: list.slice(0, limit).map((c) => ({ id: String(c._id), name: c.fullName, phone: c.phone })),
    more: list.length > limit,
  };
}

export type SaleCustomerError = 'nameRequired' | 'phoneRequired' | 'badPhone';
type SaleCustomer = { _id: Types.ObjectId; fullName: string; phone: string };

/**
 * Sotuv mijozi (majburiy): ro'yxatdan tanlangan bo'lsa — o'sha yozuv; aks holda telefon bo'yicha
 * topiladi yoki yangisi ochiladi. Shu telefonli mijoz bor bo'lsa — uning ismi USTIDAN YOZILMAYDI
 * (sotuvchi boshqa mijoz kartochkasini o'zgartirib yubormasin); ism «Mijozlar» bo'limida tahrirlanadi.
 */
export async function resolveSaleCustomer(
  m: CustomerModels,
  input: { customerId?: string; name: string; phone: string },
): Promise<{ ok: true; customer: SaleCustomer } | { ok: false; error: SaleCustomerError }> {
  if (input.customerId && Types.ObjectId.isValid(input.customerId)) {
    const picked = await m.Customer.findById(input.customerId).select('fullName phone').lean<SaleCustomer>();
    if (picked) return { ok: true, customer: picked };
  }
  const name = input.name.trim();
  const phone = input.phone.trim();
  if (!name) return { ok: false, error: 'nameRequired' };
  if (!phone) return { ok: false, error: 'phoneRequired' };
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 15) return { ok: false, error: 'badPhone' };
  const canon = canonicalPhone(phone);
  const found = await findCustomerByPhone(m, canon);
  if (found) return { ok: true, customer: found as SaleCustomer };
  const created = await m.Customer.create({ fullName: name, phone: canon });
  return { ok: true, customer: { _id: created._id, fullName: created.fullName, phone: created.phone } };
}
