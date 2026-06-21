import type { Model } from 'mongoose';
import type { IBranch } from '@/lib/models/tenant/Branch';

/**
 * Biznes egasi (admin) ombori — `isMain: true` filial.
 * Admin qo'shgan mahsulotlar shu yerda turadi (filial tanlash shart emas),
 * keyin "Filialga berish" orqali filiallarga o'tkaziladi.
 * Yo'q bo'lsa avtomatik yaratadi (eski do'konlar uchun ham ishlaydi).
 */
export async function ensureMainBranchId(Branch: Model<IBranch>, name = 'Asosiy ombor'): Promise<string> {
  const existing = await Branch.findOne({ isMain: true }).lean();
  if (existing) return String(existing._id);

  // Asosiy ombor doimo ALOHIDA yaratiladi — mavjud filiallar (login bilan) o'zgarmaydi
  const created = await Branch.create({ name, active: true, isMain: true });
  return String(created._id);
}
