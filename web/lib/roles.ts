import type { Model } from 'mongoose';
import { DEFAULT_ROLES, type IRole } from './models/tenant/Role';

/** Do'konda rol bo'lmasa — Kassir / Sotuvchi / Menejer shablonlarini yaratadi (takror chaqirish xavfsiz) */
export async function ensureDefaultRoles(Role: Model<IRole>): Promise<void> {
  if (await Role.estimatedDocumentCount()) return;
  await Role.insertMany(DEFAULT_ROLES, { ordered: false }).catch(() => { /* parallel so'rov yaratgan */ });
}
