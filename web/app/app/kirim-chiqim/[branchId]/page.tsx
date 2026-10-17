import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantAdminSession } from '@/lib/tenantSession';
import { aggregateFlowTotals, lineFromProduct } from '@/lib/inventoryFlow';
import KirimChiqimPanel from '@/components/tenant/KirimChiqimPanel';
import BackLink from '@/components/ui/BackLink';
import { getDict } from '@/lib/i18n/server';

export async function generateMetadata({ params }: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await params;
  const d = await getDict();
  if (branchId === 'all') return { title: d.sales.kirimChiqim.allMetaTitle };
  return { title: d.sales.kirimChiqim.detailMetaTitle };
}

export default async function KirimChiqimDetailPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId } = await params;
  const { Product, Branch, Sale } = await getTenantAdminSession();
  const d = await getDict();
  const k = d.sales.kirimChiqim;

  const branches = await Branch.find({ active: true }).sort({ createdAt: 1 }).lean();
  const branchMap = Object.fromEntries(branches.map((b) => [String(b._id), b.name]));

  const isAll = branchId === 'all';
  const branch = isAll ? null : branches.find((b) => String(b._id) === branchId);
  if (!isAll && !branch) notFound();

  const branchIds = isAll ? branches.map((b) => b._id) : [branch!._id];
  const [products, sales] = await Promise.all([
    Product.find({ branchId: { $in: branchIds } }).limit(5000).lean(),
    Sale.find({ status: { $ne: 'cancelled' }, branchId: { $in: branchIds } }).sort({ createdAt: -1 }).limit(5000).lean(),
  ]);

  // Kirim — ombordagi qoldiq mahsulotlar
  const stockLines = [];
  for (const p of products) {
    const name = branchMap[String(p.branchId)] ?? '—';
    const stock = lineFromProduct(p, name, 'stock');
    if (stock) stockLines.push(stock);
  }

  // Chiqim — haqiqiy sotuvlar (Sotildi bilan bir manba)
  const soldLines = sales.map((s) => {
    const qty = s.productSnapshot?.saleQuantity ?? 1;
    const cost = (s.productSnapshot?.purchasePrice ?? 0) * qty;
    const revenue = s.totalAmount ?? 0;
    return {
      id: String(s._id),
      productId: s.saleNo,
      name: s.productSnapshot?.name ?? '—',
      branchName: branchMap[String(s.branchId)] ?? '—',
      qty,
      unitPurchase: s.productSnapshot?.purchasePrice ?? 0,
      unitSale: qty > 0 ? Math.round(revenue / qty) : revenue,
      cost,
      revenue,
      profit: revenue - cost,
    };
  });

  const totals = aggregateFlowTotals(stockLines, soldLines);
  const title = isAll ? k.allBranches : branch!.name;

  return (
    <>
      <div className="t-page-head">
        <div>
          <div style={{ marginBottom: 8 }}>
            <BackLink href="/app/kirim-chiqim" className="btn btn-plain btn-sm">
              {k.title}
            </BackLink>
          </div>
          <h1 className="t-page-title">{title}</h1>
          <p className="t-page-sub">{k.detailSub}</p>
        </div>
        {!isAll && (
          <div className="t-page-actions">
            <Link href={`/app/products?branch=${branchId}&status=sold`} className="btn btn-ghost">
              {k.viewInStock}
            </Link>
          </div>
        )}
      </div>

      <KirimChiqimPanel totals={totals} stockLines={stockLines} soldLines={soldLines} />
    </>
  );
}
