import { getTenantSession } from '@/lib/tenantSession';
import { requireFeature } from '@/lib/auth';
import { requirePermission, userCan } from '@/lib/permissionGuard';
import { branchFilter, isBranchScoped } from '@/lib/branchScope';
import { sellableInfo } from '@/lib/productKinds';
import PosScreen, { type PosProduct } from '@/components/tenant/PosScreen';
import type { CategoryItem } from '@/lib/productCatalog';
import { getDict } from '@/lib/i18n/server';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.sales.pos.metaTitle };
}

/** Kassada bir vaqtda yuklanadigan mahsulotlar soni (qidiruv brauzerda, skaner darhol) */
const POS_PRODUCT_LIMIT = 3000;

export default async function PosPage() {
  await requireFeature('sales');
  await requirePermission('sale.create');
  const { user, org, features, Product, CashShift, ProductCategory } = await getTenantSession();

  const [products, canDiscount, canEditPrice, openShift, cats] = await Promise.all([
    Product.find({ ...branchFilter(user), status: 'in_stock' })
      .select('name imei barcode productId salePrice wholesalePrice trackQuantity quantity soldQuantity status unit categoryId kind bundleItems')
      .sort({ name: 1 })
      .limit(POS_PRODUCT_LIMIT)
      .lean(),
    userCan(user, 'sale.discount'),
    userCan(user, 'sale.editPrice'),
    // Filial xodimi — o'z filiali smenasi; egasi — istalgan ochiq smena
    features.kassa
      ? CashShift.exists(isBranchScoped(user) ? { status: 'open', branchId: user.branchId } : { status: 'open' })
      : Promise.resolve(true),
    ProductCategory.find({}, { name: 1, parentId: 1 }).sort({ name: 1 }).limit(2000).lean(),
  ]);
  const sellOf = await sellableInfo(Product, products);
  const categories: CategoryItem[] = cats.map((c) => ({ id: String(c._id), name: c.name, parentId: c.parentId ? String(c.parentId) : null }));

  const list: PosProduct[] = products.map((p) => ({
    id: String(p._id),
    name: p.name,
    codes: [p.imei, p.barcode, p.productId].filter((c): c is string => !!c),
    salePrice: p.salePrice ?? 0,
    wholesalePrice: p.wholesalePrice && p.wholesalePrice > 0 ? p.wholesalePrice : undefined,
    tracked: sellOf(p).tracked,
    available: sellOf(p).available,
    unit: p.unit ?? null,
    categoryId: p.categoryId ? String(p.categoryId) : undefined,
    service: p.kind === 'service' || undefined,
  }));

  return (
    <PosScreen
      products={list}
      categories={categories}
      canDiscount={canDiscount}
      canEditPrice={canEditPrice}
      noShift={features.kassa && !openShift}
      storageKey={`savora_pos_parked:${org._id}:${user.username}`}
      shopName={org.name}
    />
  );
}
