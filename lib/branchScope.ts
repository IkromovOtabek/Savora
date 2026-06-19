import { Types } from 'mongoose';
import type { SessionUser } from './session';

/**
 * Filial login (role 'user') faqat O'Z filiali ma'lumotini ko'radi.
 * Admin (do'kon egasi) — barcha filiallar ({} = cheklovsiz).
 *
 * Mongoose so'rovida filterga qo'shiladi: `{ ...filter, ...branchFilter(user) }`.
 */
export function branchFilter(user: Pick<SessionUser, 'role' | 'branchId'>): Record<string, never> | { branchId: string } {
  if (user.role === 'user' && user.branchId) {
    return { branchId: user.branchId };
  }
  return {};
}

/**
 * Aggregate ($match) uchun — bu yerda Mongoose string'ni ObjectId'ga avtomatik
 * o'girmaydi, shuning uchun ObjectId qaytaramiz.
 */
export function branchAggMatch(user: Pick<SessionUser, 'role' | 'branchId'>): Record<string, never> | { branchId: Types.ObjectId } {
  if (user.role === 'user' && user.branchId && Types.ObjectId.isValid(user.branchId)) {
    return { branchId: new Types.ObjectId(user.branchId) };
  }
  return {};
}

/** Filialga bog'langan (cheklangan) foydalanuvchimi */
export function isBranchScoped(user: Pick<SessionUser, 'role' | 'branchId'>): boolean {
  return user.role === 'user' && !!user.branchId;
}
