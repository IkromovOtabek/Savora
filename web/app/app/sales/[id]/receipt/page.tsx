import { notFound } from 'next/navigation';
import BackLink from '@/components/ui/BackLink';
import { Types } from 'mongoose';
import { getTenantSession } from '@/lib/tenantSession';
import { branchFilter } from '@/lib/branchScope';
import { getShopSettings } from '@/lib/shopSettings';
import PrintReceiptButton from '@/components/tenant/PrintReceiptButton';
import ReceiptPaper from '@/components/tenant/ReceiptPaper';
import { getDict } from '@/lib/i18n/server';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.sales.receipt.metaTitle };
}

export default async function SaleReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, org, Sale, ShopSettings } = await getTenantSession();
  const d = await getDict();
  if (!Types.ObjectId.isValid(id)) notFound();
  const [sale, settings] = await Promise.all([
    Sale.findOne({ _id: id, ...branchFilter(user) }).lean(),
    getShopSettings(ShopSettings),
  ]);
  if (!sale || sale.status === 'cancelled') notFound();

  return (
    <div className="sl-receipt-wrap">
      <div className="sl-receipt-bar no-print">
        <BackLink href={`/app/sales/${id}`} className="btn btn-ghost btn-sm">{d.common.back}</BackLink>
        <PrintReceiptButton defaultWidth={settings.receipt.paperWidth} />
      </div>
      <ReceiptPaper sales={[sale]} org={org} receipt={settings.receipt} d={d} />
    </div>
  );
}
