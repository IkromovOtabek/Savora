import { notFound } from 'next/navigation';
import Link from 'next/link';
import BackLink from '@/components/ui/BackLink';
import { getCurrentUser } from '@/lib/auth';
import { getTenantSession } from '@/lib/tenantSession';
import { PAYMENT_TYPE_LABELS, SALE_STATUS_LABELS } from '@/lib/models/tenant/Sale';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import SalePaymentForm from '@/components/tenant/SalePaymentForm';
import CancelSaleButton from '@/components/tenant/CancelSaleButton';
import SaleReviewTrigger from '@/components/tenant/SaleReviewTrigger';

export const metadata = { title: 'Sotuv — Savora' };

export default async function SaleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  const { Sale } = await getTenantSession();

  const sale = await Sale.findById(id).lean();
  if (!sale) notFound();

  const isAdmin = user?.role === 'admin';
  const canPay = sale.status === 'partial';
  const canCancel = isAdmin && sale.status !== 'cancelled';

  return (
    <>
      <div className="dash-head">
        <div>
          <BackLink href="/app/sales">Barcha sotuvlar</BackLink>
          <h1 className="dash-hello">{sale.saleNo}</h1>
          <p className="dash-sub">{fmtDateTime(sale.createdAt!)} · {sale.soldBy}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link href={`/app/sales/${id}/receipt`} className="btn btn-ghost btn-sm" target="_blank">Chek</Link>
          <span className={`badge-status badge-status--${sale.status === 'paid' ? 'active' : sale.status === 'partial' ? 'suspended' : 'expired'}`}>
            {SALE_STATUS_LABELS[sale.status]}
          </span>
        </div>
      </div>

      {sp?.created === '1' && (
        <>
          <div className="auth-alert auth-alert--info" style={{ marginBottom: 20 }}>Sotuv muvaffaqiyatli yakunlandi.</div>
          <SaleReviewTrigger saleId={id} />
        </>
      )}

      <div className="detail-grid">
        <div className="panel">
          <div className="panel-head"><h2>Mahsulot</h2></div>
          <div className="detail-body">
            <div className="detail-row"><span className="detail-l">Nom</span><Link href={`/app/products/${sale.productId}`} className="cell-link">{sale.productSnapshot.name}</Link></div>
            <div className="detail-row"><span className="detail-l">IMEI</span><code className="imei-code">{sale.productSnapshot.imei}</code></div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Mijoz</h2></div>
          <div className="detail-body">
            <div className="detail-row"><span className="detail-l">Ism</span><span>{sale.customerSnapshot?.fullName ?? '—'}</span></div>
            <div className="detail-row"><span className="detail-l">Telefon</span><span>{sale.customerSnapshot?.phone ?? '—'}</span></div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h2>To&apos;lov</h2></div>
          <div className="detail-body">
            <div className="detail-row"><span className="detail-l">Turi</span><span>{PAYMENT_TYPE_LABELS[sale.paymentType]}</span></div>
            {sale.paymentType === 'bank_credit' && sale.bankName && (
              <div className="detail-row"><span className="detail-l">Bank</span><span>{sale.bankName}</span></div>
            )}
            <div className="detail-row"><span className="detail-l">Jami</span><strong>{fmtMoney(sale.totalAmount)} so&apos;m</strong></div>
            <div className="detail-row"><span className="detail-l">To&apos;langan</span><span style={{ color: '#059669' }}>{fmtMoney(sale.paidAmount)} so&apos;m</span></div>
            {sale.remainingAmount > 0 && (
              <div className="detail-row"><span className="detail-l">Qoldiq</span><strong style={{ color: '#d97706' }}>{fmtMoney(sale.remainingAmount)} so&apos;m</strong></div>
            )}
            {sale.installmentMonths && (
              <div className="detail-row"><span className="detail-l">Nasiya</span><span>{sale.installmentMonths} oy</span></div>
            )}
            {sale.notes && <div className="detail-row"><span className="detail-l">Izoh</span><span>{sale.notes}</span></div>}
          </div>
        </div>
      </div>

      {sale.payments.length > 0 && (
        <div className="panel" style={{ marginTop: 20 }}>
          <div className="panel-head"><h2>To&apos;lovlar tarixi</h2></div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Sana</th><th>Summa</th><th>Izoh</th><th>Kim</th></tr>
              </thead>
              <tbody>
                {sale.payments.map((p, i) => (
                  <tr key={i}>
                    <td>{fmtDateTime(p.paidAt)}</td>
                    <td>{fmtMoney(p.amount)}</td>
                    <td>{p.note ?? '—'}</td>
                    <td>{p.recordedBy ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canPay && <SalePaymentForm saleId={String(sale._id)} remaining={sale.remainingAmount} />}
      {canCancel && <CancelSaleButton saleId={String(sale._id)} saleNo={sale.saleNo} />}
    </>
  );
}
