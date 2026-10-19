import { getTenantSession } from '@/lib/tenantSession';
import { isImeiEnabled } from '@/lib/features';
import ProductForm from '@/components/tenant/ProductForm';
import { getUsdRate } from '@/lib/currency';
import { requirePermission, userCan } from '@/lib/permissionGuard';
import { getDict } from '@/lib/i18n/server';
import { productFieldsFor } from '@/lib/businessTypes';
import { loadCategories } from '@/lib/productFields';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.stock.newPage.metaTitle };
}

export default async function NewProductPage() {
  await requirePermission('product.create');
  const { user, Branch, Product, org, features, Supplier, ShopSettings } = await getTenantSession();
  const usd = await getUsdRate(ShopSettings);
  const isAdmin = user.role === 'admin';
  // Admin barcha filialni tanlaydi; filial-login uchun faqat o'z filiali
  const query = isAdmin ? { active: true } : { active: true, _id: user.branchId };
  const branches = await Branch.find(query).sort({ name: 1 }).lean();
  // Yetkazib beruvchi tanlovi — faqat "suppliers.manage" huquqi bo'lsa
  const suppliers = (await userCan(user, 'suppliers.manage'))
    ? await Supplier.find({}, { name: 1 }).sort({ name: 1 }).limit(500).lean()
    : undefined;

  const productFields = productFieldsFor(org.businessType);
  const categories = await loadCategories(Product);

  return (
    <ProductForm
      mode="create"
      showImei={isImeiEnabled(org)}
      mediaEnabled={features.mediaUpload}
      isAdmin={isAdmin}
      currentBranchId={user.branchId}
      branches={branches.map((b) => ({ id: String(b._id), name: b.name }))}
      suppliers={suppliers?.map((x) => ({ id: String(x._id), name: x.name }))}
      usdRate={usd.rate}
      productFields={productFields}
      categories={categories}
    />
  );
}
