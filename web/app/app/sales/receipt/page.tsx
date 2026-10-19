import { notFound } from 'next/navigation';
import BackLink from '@/components/ui/BackLink';
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

const MAX_LINES = 100;

/** Kassa cheki: bitta xarid = bir nechta Sale (har qator alohida) — ?ids=a,b,c&print=1 */
export default async function PosReceiptPage({ searchParams }: { searchParams: Promise<{ ids?: string; print?: string }> }) {
  const sp = await searchParams;
  const ids = [...new Set((sp.ids ?? '').split(','))].filter((x) => /^[a-f0-9]{24}$/i.test(x)).slice(0, MAX_LINES);
  if (!ids.length) notFound();

  const { user, org, Sale, ShopSettings } = await getTenantSession();
  const d = await getDict();
  const [found, settings] = await Promise.all([
    Sale.find({ _id: { $in: ids }, status: { $ne: 'cancelled' }, ...branchFilter(user) }).lean(),
    getShopSettings(ShopSettings),
  ]);
  if (!found.length) notFound();
  // Kassadagi tartibda
  const order = new Map(ids.map((x, i) => [x, i]));
  const sales = found.sort((a, b) => (order.get(String(a._id)) ?? 0) - (order.get(String(b._id)) ?? 0));

  return (
    <div className="sl-receipt-wrap">
      <div className="sl-receipt-bar no-print">
        <BackLink href="/app/pos" className="btn btn-ghost btn-sm">{d.common.back}</BackLink>
        <PrintReceiptButton defaultWidth={settings.receipt.paperWidth} autoPrint={sp.print === '1'} />
      </div>
      <ReceiptPaper sales={sales} org={org} receipt={settings.receipt} d={d} />
    </div>
  );
}
