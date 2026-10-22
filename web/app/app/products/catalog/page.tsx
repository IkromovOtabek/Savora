import { getTenantSession } from '@/lib/tenantSession';
import { requirePermission } from '@/lib/permissionGuard';
import BackLink from '@/components/ui/BackLink';
import CatalogManager from '@/components/tenant/CatalogManager';
import { getDict } from '@/lib/i18n/server';
import '@/components/tenant/styles/stock.css';

export async function generateMetadata() {
  return { title: (await getDict()).stock.catalog.metaTitle };
}

/** Turkum va brendlarni boshqarish — mahsulot tahrirlash huquqi bilan */
export default async function CatalogPage() {
  await requirePermission('product.edit');
  const { ProductCategory, Brand, Product } = await getTenantSession();
  const t = (await getDict()).stock.catalog;

  const [cats, brands, catCounts, brandCounts] = await Promise.all([
    ProductCategory.find({}, { name: 1, parentId: 1 }).sort({ name: 1 }).limit(2000).lean(),
    Brand.find({}, { name: 1 }).sort({ name: 1 }).limit(1000).lean(),
    Product.aggregate<{ _id: unknown; n: number }>([
      { $match: { categoryId: { $ne: null } } },
      { $group: { _id: '$categoryId', n: { $sum: 1 } } },
    ]),
    // Brend mahsulotda matn — katta-kichik harfsiz guruhlanadi
    Product.aggregate<{ _id: string; n: number }>([
      { $match: { brand: { $nin: [null, ''] } } },
      { $group: { _id: { $toLower: '$brand' }, n: { $sum: 1 } } },
    ]),
  ]);

  const catN = new Map(catCounts.map((c) => [String(c._id), c.n]));
  const brandN = new Map(brandCounts.map((b) => [b._id, b.n]));

  return (
    <>
      <BackLink href="/app/products">{t.back}</BackLink>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{t.title}</h1>
          <p className="t-page-sub">{t.subtitle}</p>
        </div>
      </div>
      <CatalogManager
        categories={cats.map((c) => ({
          id: String(c._id),
          name: c.name,
          parentId: c.parentId ? String(c.parentId) : null,
          count: catN.get(String(c._id)) ?? 0,
        }))}
        brands={brands.map((b) => ({ id: String(b._id), name: b.name, count: brandN.get(b.name.toLowerCase()) ?? 0 }))}
      />
    </>
  );
}
