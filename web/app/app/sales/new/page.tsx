import { getTenantSession } from '@/lib/tenantSession';
import { branchFilter } from '@/lib/branchScope';
import { isPhoneShop } from '@/lib/businessTypes';
import { getStockQty } from '@/lib/productQuantity';
import SaleForm from '@/components/tenant/SaleForm';

export const metadata = { title: 'Yangi sotuv — Savora' };

export default async function NewSalePage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string }>;
}) {
  const sp = await searchParams;
  const { user, Product, Branch, CreditBank, org, features } = await getTenantSession();
  const phoneShop = isPhoneShop(org);

  // Filial login — faqat o'z filiali mahsulotlarini sota oladi
  const inStock = await Product.find({ ...branchFilter(user), status: 'in_stock' }).sort({ name: 1 }).lean();
  const branches = await Branch.find().lean();
  const branchMap = Object.fromEntries(branches.map((b) => [String(b._id), b.name]));
  const creditBanks = features.creditKassa
    ? (await CreditBank.find({ active: true }).sort({ name: 1 }).lean()).map((b) => b.name)
    : [];

  return (
    <SaleForm
      isPhoneShop={phoneShop}
      mediaEnabled={features.mediaUpload}
      features={features}
      creditBanks={creditBanks}
      preselectId={sp.productId}
      products={inStock.map((p) => ({
        id: String(p._id),
        name: p.name,
        salePrice: p.salePrice,
        branchName: branchMap[String(p.branchId)] ?? '—',
        imei: p.imei,
        trackQuantity: p.trackQuantity ?? false,
        available: getStockQty(p),
      }))}
    />
  );
}
