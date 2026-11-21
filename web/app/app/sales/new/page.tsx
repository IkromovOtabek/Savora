import { Types } from 'mongoose';
import { getTenantSession } from '@/lib/tenantSession';
import { branchFilter } from '@/lib/branchScope';
import { isPhoneShop } from '@/lib/businessTypes';
import { sellableInfo } from '@/lib/productKinds';
import SaleForm from '@/components/tenant/SaleForm';
import { requirePermission } from '@/lib/permissionGuard';
import { getDict } from '@/lib/i18n/server';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.sales.newSale.metaTitle };
}

export default async function NewSalePage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; payment?: string; customer?: string }>;
}) {
  await requirePermission('sale.create');
  const sp = await searchParams;
  const { user, Product, Branch, CreditBank, Customer, org, features } = await getTenantSession();
  const phoneShop = isPhoneShop(org);

  // Filial login — faqat o'z filiali mahsulotlarini sota oladi
  const inStock = await Product.find({ ...branchFilter(user), status: 'in_stock' }).sort({ name: 1 }).lean();
  const sellOf = await sellableInfo(Product, inStock);
  const branches = await Branch.find().lean();
  const branchMap = Object.fromEntries(branches.map((b) => [String(b._id), b.name]));
  const creditBanks = features.creditKassa
    ? (await CreditBank.find({ active: true }).sort({ name: 1 }).lean()).map((b) => b.name)
    : [];
  // «Yangi mijoz» formasidan qaytilganda (?customer=) — shu mijoz tanlangan holda ochiladi
  const preCustomer = sp.customer && Types.ObjectId.isValid(sp.customer)
    ? await Customer.findById(sp.customer).select('fullName phone').lean()
    : null;

  return (
    <SaleForm
      isPhoneShop={phoneShop}
      mediaEnabled={features.mediaUpload}
      features={features}
      creditBanks={creditBanks}
      canAddBank={user.role === 'admin' && features.creditKassa}
      preselectId={sp.productId}
      preselectPayment={sp.payment}
      preselectCustomer={preCustomer ? { id: String(preCustomer._id), name: preCustomer.fullName, phone: preCustomer.phone } : undefined}
      products={inStock.map((p) => ({
        id: String(p._id),
        name: p.name,
        salePrice: p.salePrice,
        branchName: branchMap[String(p.branchId)] ?? '—',
        imei: p.imei,
        trackQuantity: sellOf(p).tracked,
        available: sellOf(p).available,
        unit: p.unit ?? null,
      }))}
    />
  );
}
