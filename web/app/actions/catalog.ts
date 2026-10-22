'use server';

import { revalidatePath } from 'next/cache';
import { Types } from 'mongoose';
import { getTenantSession } from '@/lib/tenantSession';
import { userCan } from '@/lib/permissionGuard';
import { permissionDeniedError } from '@/lib/permissions';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import { softDeleteOne } from '@/lib/softDelete';
import { CATALOG_COLLATION, CATEGORY_MAX_DEPTH, CATEGORY_NAME_MAX } from '@/lib/models/tenant/ProductCategory';
import { BRAND_NAME_MAX } from '@/lib/models/tenant/Brand';
import { categoryMoveError, normalizeCatalogName, type CategoryItem } from '@/lib/productCatalog';

/**
 * Turkum va brendlarni boshqarish (/app/products/catalog): nomini o'zgartirish, ko'chirish, o'chirish.
 * Mahsulotda turkum/brend NOMI ham saqlanadi — nom o'zgarsa mahsulotlarda ham yangilanadi.
 */

type Result = { ok: true } | { ok: false; error: string };

async function manager() {
  const session = await getTenantSession();
  const denied = (await userCan(session.user, 'product.edit')) ? null : permissionDeniedError('product.edit');
  const m = (await getDict()).stock.catalog.msg;
  return { ...session, denied, m };
}

function isDuplicateKey(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: number }).code === 11000;
}

function done(): Result {
  revalidatePath('/app/products/catalog');
  revalidatePath('/app/products');
  return { ok: true };
}

export async function renameCategoryAction(id: string, rawName: string): Promise<Result> {
  const { denied, m, ProductCategory, Product } = await manager();
  if (denied) return { ok: false, error: denied.error };
  if (!Types.ObjectId.isValid(id)) return { ok: false, error: m.notFound };
  const name = normalizeCatalogName(rawName);
  if (!name) return { ok: false, error: m.nameRequired };
  if (name.length > CATEGORY_NAME_MAX) return { ok: false, error: m.nameTooLong };

  const cat = await ProductCategory.findById(id, { parentId: 1 }).lean();
  if (!cat) return { ok: false, error: m.notFound };
  const clash = await ProductCategory.findOne({ _id: { $ne: cat._id }, parentId: cat.parentId ?? null, name })
    .collation(CATALOG_COLLATION).lean();
  if (clash) return { ok: false, error: m.categoryExists };
  try {
    await ProductCategory.updateOne({ _id: cat._id }, { $set: { name } });
  } catch (err) {
    if (isDuplicateKey(err)) return { ok: false, error: m.categoryExists };
    throw err;
  }
  await Product.updateMany({ categoryId: cat._id }, { $set: { category: name } });
  return done();
}

export async function moveCategoryAction(id: string, rawParentId: string | null): Promise<Result> {
  const { denied, m, ProductCategory } = await manager();
  if (denied) return { ok: false, error: denied.error };
  if (!Types.ObjectId.isValid(id)) return { ok: false, error: m.notFound };
  const parentId = rawParentId || null;
  if (parentId && !Types.ObjectId.isValid(parentId)) return { ok: false, error: m.notFound };

  const all = await ProductCategory.find({}, { name: 1, parentId: 1 }).limit(5000).lean();
  const items: CategoryItem[] = all.map((c) => ({ id: String(c._id), name: c.name, parentId: c.parentId ? String(c.parentId) : null }));
  const self = items.find((c) => c.id === id);
  if (!self || (parentId && !items.some((c) => c.id === parentId))) return { ok: false, error: m.notFound };
  if (self.parentId === parentId) return { ok: true };

  const err = categoryMoveError(items, id, parentId, CATEGORY_MAX_DEPTH);
  if (err === 'cycle') return { ok: false, error: m.moveCycle };
  if (err === 'tooDeep') return { ok: false, error: tr(m.tooDeep, { n: CATEGORY_MAX_DEPTH }) };
  try {
    await ProductCategory.updateOne({ _id: id }, { $set: { parentId: parentId ? new Types.ObjectId(parentId) : null } });
  } catch (e) {
    // Yangi ota ostida shu nomli turkum bor (unikal indeks)
    if (isDuplicateKey(e)) return { ok: false, error: m.categoryExists };
    throw e;
  }
  return done();
}

/** Ichida subturkum bo'lsa o'chirilmaydi. Mahsulotlar turkumsiz qoladi (mahsulotning o'zi o'chmaydi). */
export async function deleteCategoryAction(id: string): Promise<Result> {
  const { denied, m, ProductCategory, Product, user } = await manager();
  if (denied) return { ok: false, error: denied.error };
  if (!Types.ObjectId.isValid(id)) return { ok: false, error: m.notFound };
  const oid = new Types.ObjectId(id);
  if (await ProductCategory.exists({ parentId: oid })) return { ok: false, error: m.hasChildren };
  const removed = await softDeleteOne(ProductCategory, { _id: oid }, user.username, ['name']);
  if (!removed) return { ok: false, error: m.notFound };
  await Product.updateMany({ categoryId: oid }, { $unset: { categoryId: 1, category: 1 } });
  return done();
}

export async function renameBrandAction(id: string, rawName: string): Promise<Result> {
  const { denied, m, Brand, Product } = await manager();
  if (denied) return { ok: false, error: denied.error };
  if (!Types.ObjectId.isValid(id)) return { ok: false, error: m.notFound };
  const name = normalizeCatalogName(rawName);
  if (!name) return { ok: false, error: m.nameRequired };
  if (name.length > BRAND_NAME_MAX) return { ok: false, error: m.nameTooLong };

  const brand = await Brand.findById(id, { name: 1 }).lean();
  if (!brand) return { ok: false, error: m.notFound };
  const clash = await Brand.findOne({ _id: { $ne: brand._id }, name }).collation(CATALOG_COLLATION).lean();
  if (clash) return { ok: false, error: m.brandExists };
  try {
    await Brand.updateOne({ _id: brand._id }, { $set: { name } });
  } catch (err) {
    if (isDuplicateKey(err)) return { ok: false, error: m.brandExists };
    throw err;
  }
  // Mahsulotlarda brend nomi matn sifatida — eski nom (katta-kichik harfsiz) yangisiga almashadi
  await Product.updateMany({ brand: brand.name }, { $set: { brand: name } }).collation(CATALOG_COLLATION);
  return done();
}

/** Brend ro'yxatdan olinadi; mahsulotlardagi brend yozuvi saqlanib qoladi */
export async function deleteBrandAction(id: string): Promise<Result> {
  const { denied, m, Brand, user } = await manager();
  if (denied) return { ok: false, error: denied.error };
  if (!Types.ObjectId.isValid(id)) return { ok: false, error: m.notFound };
  const removed = await softDeleteOne(Brand, { _id: new Types.ObjectId(id) }, user.username, ['name']);
  if (!removed) return { ok: false, error: m.notFound };
  return done();
}
