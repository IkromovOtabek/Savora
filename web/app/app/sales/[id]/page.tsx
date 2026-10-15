import { notFound } from 'next/navigation';
import Link from 'next/link';
import BackLink from '@/components/ui/BackLink';
import Icon from '@/components/icons/Icon';
import { getTenantSession } from '@/lib/tenantSession';
import { PAYMENT_TYPE_LABELS, SALE_STATUS_LABELS } from '@/lib/models/tenant/Sale';
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import { computeDebtInfo } from '@/lib/debts';
import { computeInstallmentPlan } from '@/lib/installment';
import InstallmentPlan from '@/components/tenant/InstallmentPlan';
import SalePaymentForm from '@/components/tenant/SalePaymentForm';
import CancelSaleButton from '@/components/tenant/CancelSaleButton';
import SaleReviewTrigger from '@/components/tenant/SaleReviewTrigger';
import { Types } from 'mongoose';
import { branchFilter } from '@/lib/branchScope';
import { loadUserPermissions } from '@/lib/permissionGuard';

export const metadata = { title: 'Sotuv — Savora' };

const RING_R = 40;
const RING_C = 2 * Math.PI * RING_R;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

export default async function SaleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { user, Sale } = await getTenantSession();
  if (!Types.ObjectId.isValid(id)) notFound();

  // Filial login faqat o'z filiali sotuvini ko'radi
  const sale = await Sale.findOne({ _id: id, ...branchFilter(user) }).lean();
  if (!sale) notFound();

  const perms = await loadUserPermissions(user);
  const canPay = sale.status === 'partial' && perms.has('payment.accept');
  const canCancel = perms.has('sale.cancel') && sale.status !== 'cancelled';

  // Nasiya (variant) sotuvi bo'lsa — oylik to'lov jadvali
  const plan = sale.paymentType === 'installment' ? computeInstallmentPlan(sale) : null;

  const cancelled = sale.status === 'cancelled';
  const pct = sale.totalAmount > 0 ? Math.min(100, Math.round((sale.paidAmount / sale.totalAmount) * 100)) : 100;
  const debtInfo = sale.dueDate && sale.remainingAmount > 0 ? computeDebtInfo(sale) : null;
  const customerName = sale.customerSnapshot?.fullName;
  const customerPhone = sale.customerSnapshot?.phone;
  const qty = sale.productSnapshot.saleQuantity ?? 1;
  const heroCls = cancelled ? ' sl-hero--cancelled' : sale.paymentType === 'installment' ? ' sl-hero--installment' : '';

  return (
    <>
      <div className="t-page-head">
        <div>
          <BackLink href="/app/sales">Barcha sotuvlar</BackLink>
          <h1 className="t-page-title">{sale.saleNo}</h1>
          <p className="t-page-sub">{fmtDateTime(sale.createdAt!)} · {sale.soldBy}</p>
          <div className="sl-head-pills">
            <span className={`sl-pill sl-pill--${sale.status}`}><span className="sl-dot" />{SALE_STATUS_LABELS[sale.status]}</span>
            <span className={`sl-pill sl-pill--${sale.paymentType}`}>{PAYMENT_TYPE_LABELS[sale.paymentType]}</span>
          </div>
        </div>
        <div className="t-page-actions sl-head-actions">
          {canPay && (
            <a href="#tolov" className="btn btn-primary btn-with-icon">
              <Icon name="wallet" size={16} />
              To&apos;lov qabul
            </a>
          )}
          {!cancelled && (
            <Link href={`/app/sales/${id}/receipt`} className="btn btn-ghost btn-with-icon" target="_blank">
              <Icon name="clipboard" size={16} />
              Chek
            </Link>
          )}
          {canCancel && (
            <a href="#bekor" className="btn btn-danger btn-with-icon">
              <Icon name="close" size={16} />
              Bekor qilish
            </a>
          )}
        </div>
      </div>

      {sp?.created === '1' && (
        <>
          <div className="t-note t-note--info">Sotuv muvaffaqiyatli yakunlandi.</div>
          <SaleReviewTrigger saleId={id} />
        </>
      )}

      <div className="sl-detail">
        <div className="sl-detail-main">
          <section className={`sl-hero${heroCls}`} aria-label="To'lov holati">
            <div className="sl-hero-top">
              <div className="sl-hero-sum">
                <span className="sl-hero-l">Jami summa</span>
                <span className="sl-hero-v">{fmtMoney(sale.totalAmount)} <small>so&apos;m</small></span>
                <span className="sl-hero-sub">
                  {qty > 1 ? `${qty} × ${fmtMoney(Math.round(sale.totalAmount / qty))} so'm` : sale.productSnapshot.name}
                </span>
              </div>
              <div className="sl-ring" role="img" aria-label={`${pct}% to'langan`}>
                <svg viewBox="0 0 100 100">
                  <circle className="sl-ring-track" cx="50" cy="50" r={RING_R} fill="none" strokeWidth="9" />
                  <circle
                    className="sl-ring-fill"
                    cx="50" cy="50" r={RING_R} fill="none" strokeWidth="9"
                    strokeDasharray={RING_C}
                    strokeDashoffset={RING_C * (1 - pct / 100)}
                  />
                </svg>
                <span className="sl-ring-txt"><span><b>{pct}%</b><small>to&apos;langan</small></span></span>
              </div>
            </div>
            <div className="sl-hero-grid">
              <div className="sl-hero-cell">
                <span>To&apos;langan</span>
                <strong>{fmtMoney(sale.paidAmount)}</strong>
              </div>
              <div className="sl-hero-cell">
                <span>Qoldiq</span>
                <strong>{fmtMoney(sale.remainingAmount)}</strong>
              </div>
              <div className="sl-hero-cell">
                <span>{plan ? 'Oylik to\'lov' : 'Muddat'}</span>
                <strong>
                  {plan ? fmtMoney(plan.monthly) : sale.dueDate ? fmtDate(sale.dueDate) : '—'}
                </strong>
              </div>
            </div>
          </section>

          {plan && (
            <div id="tolov">
              <InstallmentPlan plan={plan} saleId={String(sale._id)} canPay={canPay} />
            </div>
          )}

          <section className="sl-card" aria-labelledby="sl-pays-h">
            <div className="sl-card-head">
              <h2 id="sl-pays-h">To&apos;lovlar tarixi</h2>
              <small>{sale.payments.length} ta</small>
            </div>
            {sale.payments.length === 0 ? (
              <div className="sl-empty" style={{ padding: '20px 18px 26px' }}>
                <p>Hali to&apos;lov qabul qilinmagan.</p>
              </div>
            ) : (
              <ul className="sl-pays">
                {sale.payments.map((p, i) => (
                  <li key={i} className="sl-pay">
                    <span className="sl-pay-ic" aria-hidden><Icon name="check" size={16} /></span>
                    <div className="sl-pay-main">
                      <b>{p.note || 'To\'lov'}</b>
                      <span>{fmtDateTime(p.paidAt)}{p.recordedBy ? ` · ${p.recordedBy}` : ''}</span>
                    </div>
                    <span className="sl-pay-amt">+{fmtMoney(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="sl-detail-side">
          <section className="sl-card" aria-labelledby="sl-cust-h">
            <div className="sl-card-head"><h2 id="sl-cust-h">Mijoz</h2></div>
            {customerName || customerPhone ? (
              <div className="sl-person">
                <span className="sl-av" aria-hidden>{initials(customerName ?? '')}</span>
                <div>
                  <b>{customerName ?? '—'}</b>
                  {customerPhone ? <a href={`tel:${customerPhone}`}>{customerPhone}</a> : <small>Telefon yo&apos;q</small>}
                </div>
              </div>
            ) : (
              <div className="sl-person">
                <span className="sl-av sl-av--cancelled" aria-hidden><Icon name="user" size={18} /></span>
                <div><b>Noma&apos;lum mijoz</b><small>Naqd sotuvda mijoz kiritilmagan</small></div>
              </div>
            )}
          </section>

          <section className="sl-card" aria-labelledby="sl-prod-h">
            <div className="sl-card-head"><h2 id="sl-prod-h">Mahsulot va to&apos;lov</h2></div>
            <ul className="sl-kv">
              <li><span>Mahsulot</span><Link href={`/app/products/${sale.productId}`}>{sale.productSnapshot.name}</Link></li>
              {sale.productSnapshot.imei && <li><span>IMEI / kod</span><code>{sale.productSnapshot.imei}</code></li>}
              {qty > 1 && <li><span>Soni</span><span>{qty} ta</span></li>}
              <li><span>To&apos;lov turi</span><span>{PAYMENT_TYPE_LABELS[sale.paymentType]}</span></li>
              {sale.paymentType === 'bank_credit' && sale.bankName && (
                <li><span>Bank</span><span>{sale.bankName}</span></li>
              )}
              {sale.installmentMonths && <li><span>Nasiya</span><span>{sale.installmentMonths} oy</span></li>}
              {sale.dueDate && debtInfo && (
                <li>
                  <span>To&apos;lov muddati</span>
                  <span className={debtInfo.state === 'overdue' ? 'sl-danger-txt' : undefined}>
                    {fmtDate(sale.dueDate)} · {debtInfo.label}
                  </span>
                </li>
              )}
              {sale.notes && <li><span>Izoh</span><span>{sale.notes}</span></li>}
            </ul>
          </section>

          {/* Nasiya sotuvida to'lov oy kataklariga bosib qo'shiladi; boshqa qarzlarda esa forma orqali */}
          {canPay && !plan && (
            <div id="tolov">
              <SalePaymentForm saleId={String(sale._id)} remaining={sale.remainingAmount} />
            </div>
          )}
          {canCancel && (
            <div id="bekor">
              <CancelSaleButton saleId={String(sale._id)} saleNo={sale.saleNo} />
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
