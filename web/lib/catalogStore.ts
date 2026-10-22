import { Types, type Model } from 'mongoose';
import type { IProductCategory } from '@/lib/models/tenant/ProductCategory';
import { CATALOG_COLLATION, CATEGORY_MAX_DEPTH } from '@/lib/models/tenant/ProductCategory';
import type { IBrand } from '@/lib/models/tenant/Brand';

/**
 * Katalog (turkum, brend) — bazaga yozish. Web server action va mobil API shu yerdan foydalanadi.
 * Takrorlanishdan unikal indeks himoya qiladi: parallel so'rovda E11000 bo'lsa — mavjud yozuv qaytadi.
 */

type CategoryModel = Model<IProductCategory>;
type BrandModel = Model<IBrand>;

function isDuplicateKey(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: number }).code === 11000;
}

/** Shu nomli brend (katta-kichik harfsiz) yoki yangisi */
export async function findOrCreateBrand(Brand: BrandModel, name: string, by: string) {
  const find = () => Brand.findOne({ name }, { name: 1 }).collation(CATALOG_COLLATION).lean();
  const existing = await find();
  if (existing) return { id: String(existing._id), name: existing.name, created: false };
  try {
    const b = await Brand.create({ name, createdBy: by });
    return { id: String(b._id), name: b.name, created: true };
  } catch (err) {
    const again = isDuplicateKey(err) ? await find() : null;
    if (!again) throw err;
    return { id: String(again._id), name: again.name, created: false };
  }
}

/** Turkum darajasi (yuqori daraja = 1); topilmasa null. Zanjir CATEGORY_MAX_DEPTH+1 dan uzun o'qilmaydi */
export async function categoryLevelInDb(ProductCategory: CategoryModel, id: string): Promise<number | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  let cur = await ProductCategory.findById(id, { parentId: 1 }).lean();
  if (!cur) return null;
  let level = 0;
  while (cur && level <= CATEGORY_MAX_DEPTH) {
    level++;
    cur = cur.parentId ? await ProductCategory.findById(cur.parentId, { parentId: 1 }).lean() : null;
  }
  return level;
}

/** Shu ota ostida shu nomli turkum yoki yangisi (chuqurlik tekshiruvi chaqiruvchida) */
export async function findOrCreateCategory(
  ProductCategory: CategoryModel,
  name: string,
  parentId: Types.ObjectId | null,
  by: string,
) {
  const find = () => ProductCategory.findOne({ parentId, name }, { name: 1 }).collation(CATALOG_COLLATION).lean();
  const existing = await find();
  if (existing) return existing._id;
  try {
    return (await ProductCategory.create({ name, parentId, createdBy: by }))._id;
  } catch (err) {
    const again = isDuplicateKey(err) ? await find() : null;
    if (!again) throw err;
    return again._id;
  }
}
