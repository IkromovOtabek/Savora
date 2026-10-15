import { notFound } from 'next/navigation';
import BackLink from '@/components/ui/BackLink';
import { Types } from 'mongoose';
import { getTenantSession } from '@/lib/tenantSession';
import { branchFilter } from '@/lib/branchScope';
import { PAYMENT_TYPE_LABELS } from '@/lib/models/tenant/Sale';
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import { computeInstallmentPlan } from '@/lib/installment';
import PrintReceiptButton from '@/components/tenant/PrintReceiptButton';

export const metadata = { title: 'Chek — Savora' };

export default async function SaleReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, org, Sale } = await getTenantSession();
  if (!Types.ObjectId.isValid(id)) notFound();
  const sale = await Sale.findOne({ _id: id, ...branchFilter(user) }).lean();
  if (!sale || sale.status === 'cancelled') notFound();

  const qty = sale.productSnapshot.saleQuantity ?? 1;
  const unit = qty > 0 ? Math.round(sale.totalAmount / qty) : sale.totalAmount;
  const plan = sale.paymentType === 'installment' ? computeInstallmentPlan(sale) : null;
  const nextDue = plan?.schedule.find((m) => !m.paid);
  const customer = sale.customerSnapshot?.fullName;
  const phone = sale.customerSnapshot?.phone;

  return (
    <div className="sl-receipt-wrap">
      <div className="sl-receipt-bar no-print">
        <BackLink href={`/app/sales/${id}`} className="btn btn-ghost btn-sm">Orqaga</BackLink>
        <PrintReceiptButton />
      </div>

      <article className="sl-receipt-paper" aria-label="Sotuv cheki">
        <header className="sl-rc-head">
          <span className="sl-rc-mark" aria-hidden>{org.name.trim().charAt(0).toUpperCase() || 'S'}</span>
          <strong>{org.name}</strong>
          {org.phone && <span>Tel: {org.phone}</span>}
          <span className="sl-rc-title">Sotuv cheki</span>
        </header>

        <hr className="sl-rc-cut" />

        <dl className="sl-rc-meta">
          <dt>Chek №</dt><dd>{sale.saleNo}</dd>
          <dt>Sana</dt><dd>{fmtDateTime(sale.createdAt!)}</dd>
          <dt>Sotuvchi</dt><dd>{sale.soldBy}</dd>
          {customer && (<><dt>Mijoz</dt><dd>{customer}</dd></>)}
          {phone && (<><dt>Telefon</dt><dd>{phone}</dd></>)}
        </dl>

        <hr className="sl-rc-cut" />

        <div className="sl-rc-item">
          <div className="sl-rc-item-top">
            <b>{sale.productSnapshot.name}</b>
            <strong>{fmtMoney(sale.totalAmount)}</strong>
          </div>
          {qty > 1 && <small>{qty} × {fmtMoney(unit)}</small>}
          {sale.productSnapshot.imei && <small>Kod: {sale.productSnapshot.imei}</small>}
        </div>

        <hr className="sl-rc-cut" />

        <div className="sl-rc-total">
          <span>JAMI</span>
          <strong>{fmtMoney(sale.totalAmount)} so&apos;m</strong>
        </div>
        <div className="sl-rc-line"><span>To&apos;lov turi</span><span>{PAYMENT_TYPE_LABELS[sale.paymentType]}</span></div>
        {sale.paymentType === 'bank_credit' && sale.bankName && (
          <div className="sl-rc-line"><span>Bank</span><span>{sale.bankName}</span></div>
        )}
        <div className="sl-rc-line"><span>To&apos;langan</span><span>{fmtMoney(sale.paidAmount)} so&apos;m</span></div>
        {sale.remainingAmount > 0 && (
          <div className="sl-rc-line sl-rc-rem"><span>Qoldiq</span><span>{fmtMoney(sale.remainingAmount)} so&apos;m</span></div>
        )}
        {plan && (
          <>
            <div className="sl-rc-line"><span>Nasiya</span><span>{plan.months} oy × {fmtMoney(plan.monthly)}</span></div>
            {nextDue && sale.remainingAmount > 0 && (
              <div className="sl-rc-line"><span>Keyingi to&apos;lov</span><span>{fmtDate(nextDue.dueDate)}</span></div>
            )}
          </>
        )}
        {!plan && sale.dueDate && sale.remainingAmount > 0 && (
          <div className="sl-rc-line"><span>To&apos;lov muddati</span><span>{fmtDate(sale.dueDate)}</span></div>
        )}

        <hr className="sl-rc-cut" />

        <footer className="sl-rc-foot">
          <b>Rahmat! Yana keling.</b>
          <span className="sl-rc-code">{sale.saleNo}</span>
        </footer>
      </article>
    </div>
  );
}
