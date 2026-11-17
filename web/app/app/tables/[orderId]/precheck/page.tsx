import { notFound, redirect } from 'next/navigation';
import BackLink from '@/components/ui/BackLink';
import { getTenantSession } from '@/lib/tenantSession';
import { restaurantCtxFromSession } from '@/lib/restaurant/session';
import { getOrder } from '@/lib/restaurant/queries';
import { getShopSettings } from '@/lib/shopSettings';
import { resolvePublicFileUrl } from '@/lib/fileUrl';
import PrintReceiptButton from '@/components/tenant/PrintReceiptButton';
import PrecheckPaper from '@/components/restaurant/order/PrecheckPaper';
import { getDict } from '@/lib/i18n/server';
import '@/components/tenant/styles/sales.css';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.restaurant.order.precheckMeta };
}

/** Pre-chek varag'i (80 mm, chop etish): ?print=1 — ochilishi bilan chop etish oynasi (buyurtma ekranidagi yashirin iframe) */
export default async function PrecheckPage({ params, searchParams }: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const [{ orderId }, sp] = await Promise.all([params, searchParams]);
  const [ctx, { org }, d] = await Promise.all([restaurantCtxFromSession(), getTenantSession(), getDict()]);
  if (!ctx.features.tables) redirect('/app/locked?m=tables');
  const r = await getOrder(ctx, orderId);
  if (!r.ok) notFound();
  const order = r.data.order;
  if (order.status === 'cancelled') notFound();
  const settings = await getShopSettings(ctx.m.ShopSettings);
  const logo = settings.restaurant.brand.logoUrl ? resolvePublicFileUrl(settings.restaurant.brand.logoUrl) : null;

  return (
    <div className="sl-receipt-wrap">
      <div className="sl-receipt-bar no-print">
        <BackLink href={`/app/tables/${order.id}`} className="btn btn-ghost btn-sm">{d.common.back}</BackLink>
        <PrintReceiptButton defaultWidth={settings.receipt.paperWidth} autoPrint={sp.print === '1'} />
      </div>
      <PrecheckPaper
        order={order}
        org={{ name: org.name, phone: org.phone }}
        receipt={settings.receipt}
        logoUrl={logo}
        d={d}
        printedAt={new Date().toISOString()}
      />
    </div>
  );
}
