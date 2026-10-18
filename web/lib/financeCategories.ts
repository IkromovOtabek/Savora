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
