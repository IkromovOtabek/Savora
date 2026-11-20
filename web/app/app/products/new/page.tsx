import { getTenantSession } from '@/lib/tenantSession';
import { isImeiEnabled } from '@/lib/features';
import ProductForm from '@/components/tenant/ProductForm';
import { getUsdRate } from '@/lib/currency';
import { requirePermission, userCan } from '@/lib/permissionGuard';
import { getDict } from '@/lib/i18n/server';
import { isPhoneShop, orgProductFields, parseBusinessType } from '@/lib/businessTypes';
import { ensureMainBranchId } from '@/lib/mainBranch';
import { loadBundleCandidates } from '@/lib/productKinds';
import { loadExtraFieldNames } from '@/lib/productFields';
import { getShopSettings } from '@/lib/shopSettings';
import { resolveLabelSettings } from '@/lib/labels/settings';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.stock.newPage.metaTitle };
}

export default async function NewProductPage() {
  await requirePermission('product.create');
  const d = await getDict();
  const { user, Branch, org, features, Supplier, ShopSettings, ProductCategory, Brand, Product } = await getTenantSession();
  const usd = await getUsdRate(ShopSettings);
  const isAdmin = user.role === 'admin';
  // Admin barcha filialni tanlaydi; filial-login uchun faqat o'z filiali
  const query = isAdmin ? { active: true } : { active: true, _id: user.branchId };
  const branches = await Branch.find(query).sort({ name: 1 }).lean();
  // Yetkazib beruvchi tanlovi — faqat "suppliers.manage" huquqi bo'lsa
  const suppliers = (await userCan(user, 'suppliers.manage'))
    ? await Supplier.find({}, { name: 1 }).sort({ name: 1 }).limit(500).lean()
    : undefined;

  const productFields = orgProductFields(org);
  // Katalog: turkumlar (daraxt formada quriladi) va brendlar — mobil /api/mobile/catalog/* bilan bir xil
  // To'plam tarkibi — mahsulot tushadigan ombor tovarlaridan (createProductAction bilan bir xil ombor)
  const targetBranchId = user.role === 'user' && user.branchId ? user.branchId : await ensureMainBranchId(Branch);
  const [categories, brands, bundleCandidates, extraNames, shopSettings] = await Promise.all([
    ProductCategory.find({}, { name: 1, parentId: 1 }).sort({ name: 1 }).limit(2000).lean(),
    Brand.find({}, { name: 1 }).sort({ name: 1 }).limit(1000).lean(),
    loadBundleCandidates(Product, targetBranchId, { canViewCost: await userCan(user, 'product.viewCost') }),
    loadExtraFieldNames(Product),
    getShopSettings(ShopSettings),
  ]);
  const showImei = isImeiEnabled(org);
  // «Barkod kerak» — IMEI'siz do'konda; sukut — yorliq sozlamasidagi «qo'shilgach darhol chop etish»
  const barcodeDefault = resolveLabelSettings(shopSettings.label, isPhoneShop(org)).autoPrint;

  return (
    <ProductForm
      mode="create"
      showImei={showImei}
      barcodeChoice={showImei ? undefined : { defaultOn: barcodeDefault }}
      createTitle={d.catalog.terms[parseBusinessType(org.businessType || 'general')].addItem}
      mediaEnabled={features.mediaUpload}
      isAdmin={isAdmin}
      currentBranchId={user.branchId}
      branches={branches.map((b) => ({ id: String(b._id), name: b.name }))}
      suppliers={suppliers?.map((x) => ({ id: String(x._id), name: x.name }))}
      usdRate={usd.rate}
      productFields={productFields}
      categories={categories.map((c) => ({ id: String(c._id), name: c.name, parentId: c.parentId ? String(c.parentId) : null }))}
      brands={brands.map((b) => ({ id: String(b._id), name: b.name }))}
      bundleCandidates={bundleCandidates}
      extraNames={extraNames}
      // Xarid birligi / minimal qoldiq — saqlangach kartochkada (yaratishda izoh)
      stockSettings={{ itemCode: null, purchaseUnit: null, purchaseFactor: null, minStock: null, purchasing: !!(features.production || features.purchasing) }}
    />
  );
}
