import type { Model } from 'mongoose';
import { DEFAULT_ROLES, MANUFACTURING_ROLES, RESTAURANT_ROLES, type IRole } from './models/tenant/Role';

/** Biznes turiga xos qo'shimcha rol shablonlari (nomi bo'yicha idempotent qo'shiladi) */
export function roleTemplatesFor(businessType?: string | null): typeof DEFAULT_ROLES {
  if (businessType === 'restaurant') return RESTAURANT_ROLES;
  if (businessType === 'manufacturing') return MANUFACTURING_ROLES;
  return [];
}

/**
 * Do'konda rol bo'lmasa — Kassir / Sotuvchi / Menejer shablonlarini yaratadi (takror chaqirish xavfsiz).
 * Restoran turida qo'shimcha Ofitsant / Oshpaz / Barmen / Kassir (restoran) / Administrator — NOMI bo'yicha
 * yo'q bo'lsagina qo'shiladi (yangi va mavjud restoranlar uchun); egasi tahrirlagan rol o'zgarmaydi.
 * Ishlab chiqarish sexida — Omborchi / Sex boshlig'i / Usta / ishchi / Hisobchi (xuddi shu qoida).
 */
export async function ensureDefaultRoles(Role: Model<IRole>, businessType?: string | null): Promise<void> {
  if (!(await Role.estimatedDocumentCount())) {
    await Role.insertMany(DEFAULT_ROLES, { ordered: false }).catch(() => { /* parallel so'rov yaratgan */ });
  }
  const extra = roleTemplatesFor(businessType);
  if (!extra.length) return;
  const have = new Set((await Role.find({ name: { $in: extra.map((r) => r.name) } }).select('name').lean()).map((r) => r.name));
  const missing = extra.filter((r) => !have.has(r.name));
  if (missing.length) {
    // Unikal nom indeksi: parallel so'rov qo'shgan bo'lsa — E11000, e'tiborsiz
    await Role.insertMany(missing, { ordered: false }).catch(() => {});
  }
}
