import { notFound } from 'next/navigation';
import Link from 'next/link';
import BackLink from '@/components/ui/BackLink';
import { getTenantSession } from '@/lib/tenantSession';
import { PAYMENT_TYPE_LABELS } from '@/lib/models/tenant/Sale';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import PrintReceiptButton from '@/components/tenant/PrintReceiptButton';

export const metadata = { title: 'Chek — Savora' };

export default async function SaleReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org, Sale } = await getTenantSession();
  const sale = await Sale.findById(id).lean();
  if (!sale || sale.status === 'cancelled') notFound();

  return (
    <div className="receipt-wrap">
      <div className="receipt-actions no-print">
        <BackLink href={`/app/sales/${id}`} className="btn btn-ghost btn-sm">Orqaga</BackLink>
        <PrintReceiptButton />
      </div>

      <div className="receipt-paper">
        <div className="receipt-head">
          <strong>{org.name}</strong>
          {org.phone && <div>Tel: {org.phone}</div>}
          <div>Sotuv cheki</div>
        </div>
        <div className="receipt-meta">
          <div>№ {sale.saleNo}</div>
          <div>{fmtDateTime(sale.createdAt!)}</div>
          <div>Sotuvchi: {sale.soldBy}</div>
        </div>
        <hr />
        <div className="receipt-line"><span>Mahsulot</span><span>{sale.productSnapshot.name}</span></div>
        <div className="receipt-line"><span>Kod</span><span>{sale.productSnapshot.imei}</span></div>
        {(() => {
          const qty = sale.productSnapshot.saleQuantity ?? 1;
          if (qty > 1) {
            const unit = Math.round(sale.totalAmount / qty);
            return (
              <div className="receipt-line"><span>Soni × narx</span><span>{qty} × {fmtMoney(unit)}</span></div>
            );
          }
          return null;
        })()}
        <div className="receipt-line"><span>Mijoz</span><span>{sale.customerSnapshot?.fullName ?? '—'}</span></div>
        <div className="receipt-line"><span>Telefon</span><span>{sale.customerSnapshot?.phone ?? '—'}</span></div>
        <hr />
        <div className="receipt-line"><span>To&apos;lov</span><span>{PAYMENT_TYPE_LABELS[sale.paymentType]}</span></div>
        <div className="receipt-line receipt-total"><span>JAMI</span><strong>{fmtMoney(sale.totalAmount)} so&apos;m</strong></div>
        <div className="receipt-line"><span>To&apos;langan</span><span>{fmtMoney(sale.paidAmount)} so&apos;m</span></div>
        {sale.remainingAmount > 0 && (
          <div className="receipt-line"><span>Qoldiq</span><span>{fmtMoney(sale.remainingAmount)} so&apos;m</span></div>
        )}
        <hr />
        <div className="receipt-foot">Rahmat! Yana keling.</div>
      </div>
    </div>
  );
}
