import type { Model } from 'mongoose';
import { DEFAULT_FINANCE_CATEGORIES, type IFinanceCategory } from './models/tenant/FinanceCategory';

/** Do'konda toifa bo'lmasa — boshlang'ich to'plamni yaratadi (takror chaqirish xavfsiz) */
export async function ensureFinanceCategories(FinanceCategory: Model<IFinanceCategory>): Promise<void> {
  if (await FinanceCategory.estimatedDocumentCount()) return;
  await FinanceCategory.insertMany(
    DEFAULT_FINANCE_CATEGORIES.map((c) => ({ ...c, active: true })),
    { ordered: false },
  ).catch(() => { /* parallel so'rov allaqachon yaratgan — unikal indeks */ });
}

/** Tez xarajat uchun: faol, tizimdan tashqari chiqim toifalari nomlari (kerak bo'lsa boshlang'ich to'plam yaratiladi) */
export async function loadExpenseCategories(FinanceCategory: Model<IFinanceCategory>): Promise<string[]> {
  await ensureFinanceCategories(FinanceCategory);
  const list = await FinanceCategory.find({ type: 'expense', active: true, system: { $ne: true } })
    .sort({ name: 1 }).select('name').limit(100).lean();
  return list.map((c) => c.name);
}
