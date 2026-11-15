import { notFound } from 'next/navigation';
import { Types } from 'mongoose';
import BackLink from '@/components/ui/BackLink';
import { getTenantSession } from '@/lib/tenantSession';
import { requireSaleViewScope } from '@/lib/permissionGuard';
import { branchFilter } from '@/lib/branchScope';
import { getShopSettings } from '@/lib/shopSettings';
import PrintReceiptButton from '@/components/tenant/PrintReceiptButton';
import PaymentReceiptPaper from '@/components/tenant/PaymentReceiptPaper';
import { getDict } from '@/lib/i18n/server';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.sales.receipt.payMeta };
}

/** Bitta to'lov cheki — nasiya oylik to'lovi yoki qarz to'lovidan keyin («?print=1» — darhol chop etish) */
export default async function PaymentReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; paymentId: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { id, paymentId } = await params;
  const sp = await searchParams;
  const { user, org, Sale, ShopSettings } = await getTenantSession();
  const d = await getDict();
  if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(paymentId)) notFound();
  // Filial login — faqat o'z filiali; «Sotuvlarni ko'rish» yo'q bo'lsa — faqat o'zi qilgan sotuv
  const scope = await requireSaleViewScope(user);
  const [sale, settings] = await Promise.all([
    Sale.findOne({ _id: id, ...branchFilter(user), ...scope }).lean(),
    getShopSettings(ShopSettings),
  ]);
  if (!sale || sale.status === 'cancelled') notFound();
  const index = sale.payments.findIndex((p) => String((p as { _id?: unknown })._id) === paymentId);
  if (index < 0) notFound();

  return (
    <div className="sl-receipt-wrap">
      <div className="sl-receipt-bar no-print">
        <BackLink href={`/app/sales/${id}`} className="btn btn-ghost btn-sm">{d.common.back}</BackLink>
        <PrintReceiptButton defaultWidth={settings.receipt.paperWidth} autoPrint={sp.print === '1'} />
      </div>
      <PaymentReceiptPaper sale={sale} payment={sale.payments[index]} index={index} org={org} receipt={settings.receipt} d={d} />
    </div>
  );
}
