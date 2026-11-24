import { isPhoneQuery, nameWords, wordPattern } from './saleCustomer';

/** Qidiruv satri uzunligi chegarasi (regex DB'ni qiynamasligi uchun) */
export const SALE_QUERY_MAX = 60;

/** Sotuvdagi matn maydonlari: mahsulot, model, brend, mijoz, sotuv raqami, IMEI/kod */
const TEXT_FIELDS = [
  'productSnapshot.name',
  'productSnapshot.deviceModel',
  'productSnapshot.brand',
  'customerSnapshot.fullName',
  'saleNo',
  'productSnapshot.imei',
] as const;

/** Qidiruv satrini tozalash: bo'sh joylar, uzunlik */
export function normSaleQuery(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ').slice(0, SALE_QUERY_MAX) : '';
}

/**
 * Sotuvlar qidiruvi (web ro'yxat va mobil API uchun umumiy Mongo filtri).
 * Raqam (3+ raqam) — mijoz telefoni (oxirgi 9 raqam, format farqi e'tiborsiz), sotuv raqami yoki IMEI/kod.
 * Matn — har bir so'z mahsulot / mijoz / sotuv raqami / IMEI dan birida (tartibi ixtiyoriy).
 * Bo'sh satr — null (filtr qo'shilmaydi).
 */
export function saleSearchFilter(raw: unknown): Record<string, unknown> | null {
  const q = normSaleQuery(raw);
  if (!q) return null;
  if (isPhoneQuery(q)) {
    const digits = q.replace(/\D/g, '');
    return {
      $or: [
        { 'customerSnapshot.phone': { $regex: digits.slice(-9).split('').join('\\D*') } },
        { saleNo: { $regex: digits } },
        { 'productSnapshot.imei': { $regex: digits } },
      ],
    };
  }
  return {
    $and: nameWords(q).map((w) => {
      const re = { $regex: wordPattern(w), $options: 'i' };
      return { $or: TEXT_FIELDS.map((f) => ({ [f]: re })) };
    }),
  };
}
