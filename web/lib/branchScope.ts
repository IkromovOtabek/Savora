import { Types } from 'mongoose';
import type { SessionUser } from './session';

/**
 * Hech narsaga mos kelmaydigan filtr — find/countDocuments/updateOne'da bo'sh natija.
 * `{ _id: id, ...branchFilter(user) }` ko'rinishida ham _id'ni bosib o'tadi (xavfsiz).
 */
export const MATCH_NOTHING = { _id: { $in: [] as never[] } } as const;

/**
 * Filial login (role 'user') faqat O'Z filiali ma'lumotini ko'radi.
 * Admin (do'kon egasi) — barcha filiallar ({} = cheklovsiz).
 *
 * Mongoose so'rovida filterga qo'shiladi: `{ ...filter, ...branchFilter(user) }`.
 */
export function branchFilter(
  user: Pick<SessionUser, 'role' | 'branchId'>,
): Record<string, never> | { branchId: string } | typeof MATCH_NOTHING {
  if (user.role === 'user') {
    // Fail-closed: filialsiz 'user' hech narsa ko'rmaydi (ochiq qolib ketmasin)
    return user.branchId ? { branchId: user.branchId } : MATCH_NOTHING;
  }
  return {};
}

/**
 * Aggregate ($match) uchun — bu yerda Mongoose string'ni ObjectId'ga avtomatik
 * o'girmaydi, shuning uchun ObjectId qaytaramiz.
 */
export function branchAggMatch(
  user: Pick<SessionUser, 'role' | 'branchId'>,
): Record<string, never> | { branchId: Types.ObjectId } | typeof MATCH_NOTHING {
  if (user.role === 'user') {
    // Fail-closed: branchId yo'q yoki noto'g'ri bo'lsa — hech narsa
    return user.branchId && Types.ObjectId.isValid(user.branchId)
      ? { branchId: new Types.ObjectId(user.branchId) }
      : MATCH_NOTHING;
  }
  return {};
}

/** Filialga bog'langan (cheklangan) foydalanuvchimi */
export function isBranchScoped(user: Pick<SessionUser, 'role' | 'branchId'>): boolean {
  return user.role === 'user' && !!user.branchId;
}
