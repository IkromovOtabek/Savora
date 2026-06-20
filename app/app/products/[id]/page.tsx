import { notFound } from 'next/navigation';
import { getTenantSession } from '@/lib/tenantSession';
import { isImeiEnabled } from '@/lib/features';
import { ProductStatus } from '@/lib/models/tenant/Product';
import ProductForm from '@/components/tenant/ProductForm';
import DeleteProductButton from '@/components/tenant/DeleteProductButton';
import ProductHistory from '@/components/tenant/ProductHistory';

export const metadata = { title: 'Mahsulot — Savora' };

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { user, Product, Branch, CreditBank, org, features } = await getTenantSession();
  const isAdmin = user.role === 'admin';

  const product = await Product.findById(id).lean();
  if (!product) notFound();
  // Filial-login faqat o'z filiali mahsulotini ko'radi/tahrirlaydi
  if (!isAdmin && user.branchId && String(product.branchId) !== user.branchId) notFound();

  const branches = await Branch.find({ active: true }).sort({ name: 1 }).lean();
  const creditBanks = features.creditKassa
    ? await CreditBank.find({ active: true }).sort({ name: 1 }).lean()
    : [];

  return (
    <>
      {sp?.created === '1' && (
        <div className="auth-alert auth-alert--info" style={{ marginBottom: 16 }}>Mahsulot muvaffaqiyatli qo&apos;shildi.</div>
      )}
      <ProductForm
        mode="edit"
        showImei={isImeiEnabled(org)}
        mediaEnabled={features.mediaUpload}
        creditKassaEnabled={features.creditKassa}
        creditBanks={creditBanks.map((b) => ({ id: String(b._id), name: b.name }))}
        isAdmin={isAdmin}
        currentBranchId={user.branchId}
        branches={branches.map((b) => ({ id: String(b._id), name: b.name }))}
        initial={{
          id: String(product._id),
          name: product.name,
          imei: product.imei,
          barcode: product.barcode ?? '',
          color: product.color ?? '',
          branchId: String(product.branchId),
          notes: product.notes ?? '',
          photoUrl: product.photoUrl,
          status: product.status as ProductStatus,
          soldPaymentType: product.soldPaymentType,
          soldBankName: product.soldBankName,
          purchasePrice: product.purchasePrice,
          salePrice: product.salePrice,
          productId: product.productId,
          trackQuantity: product.trackQuantity ?? false,
          quantity: product.quantity ?? 1,
          soldQuantity: product.soldQuantity ?? 0,
        }}
      />
      <ProductHistory history={product.history ?? []} />

      <div style={{ maxWidth: 640, marginTop: 16 }}>
        <DeleteProductButton productId={String(product._id)} productName={product.name} />
      </div>
    </>
  );
}
