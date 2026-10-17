import { notFound } from 'next/navigation';
import BackLink from '@/components/ui/BackLink';
import { Types } from 'mongoose';
import { getTenantSession } from '@/lib/tenantSession';
import { branchFilter } from '@/lib/branchScope';
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import { computeInstallmentPlan } from '@/lib/installment';
import PrintReceiptButton from '@/components/tenant/PrintReceiptButton';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.sales.receipt.metaTitle };
}

export default async function SaleReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, org, Sale } = await getTenantSession();
  const d = await getDict();
  const k = d.sales.receipt;
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
        <BackLink href={`/app/sales/${id}`} className="btn btn-ghost btn-sm">{d.common.back}</BackLink>
        <PrintReceiptButton />
      </div>

      <article className="sl-receipt-paper" aria-label={k.title}>
        <header className="sl-rc-head">
          <span className="sl-rc-mark" aria-hidden>{org.name.trim().charAt(0).toUpperCase() || 'S'}</span>
          <strong>{org.name}</strong>
          {org.phone && <span>Tel: {org.phone}</span>}
          <span className="sl-rc-title">{k.title}</span>
        </header>

        <hr className="sl-rc-cut" />

        <dl className="sl-rc-meta">
          <dt>{k.no}</dt><dd>{sale.saleNo}</dd>
          <dt>{d.common.date}</dt><dd>{fmtDateTime(sale.createdAt!)}</dd>
          <dt>{k.seller}</dt><dd>{sale.soldBy}</dd>
          {customer && (<><dt>{d.common.customer}</dt><dd>{customer}</dd></>)}
          {phone && (<><dt>{d.common.phone}</dt><dd>{phone}</dd></>)}
        </dl>

        <hr className="sl-rc-cut" />

        <div className="sl-rc-item">
          <div className="sl-rc-item-top">
            <b>{sale.productSnapshot.name}</b>
            <strong>{fmtMoney(sale.totalAmount)}</strong>
          </div>
          {qty > 1 && <small>{qty} × {fmtMoney(unit)}</small>}
          {sale.productSnapshot.imei && <small>{tr(k.code, { code: sale.productSnapshot.imei })}</small>}
        </div>

        <hr className="sl-rc-cut" />

        <div className="sl-rc-total">
          <span>{k.total}</span>
          <strong>{fmtMoney(sale.totalAmount)} {d.common.sum}</strong>
        </div>
        <div className="sl-rc-line"><span>{d.sales.paymentType}</span><span>{d.sales.paymentTypesFull[sale.paymentType]}</span></div>
        {sale.paymentType === 'bank_credit' && sale.bankName && (
          <div className="sl-rc-line"><span>{d.sales.detail.bank}</span><span>{sale.bankName}</span></div>
        )}
        <div className="sl-rc-line"><span>{d.common.paid}</span><span>{fmtMoney(sale.paidAmount)} {d.common.sum}</span></div>
        {sale.remainingAmount > 0 && (
          <div className="sl-rc-line sl-rc-rem"><span>{d.common.remaining}</span><span>{fmtMoney(sale.remainingAmount)} {d.common.sum}</span></div>
        )}
        {plan && (
          <>
            <div className="sl-rc-line"><span>{d.common.installment}</span><span>{tr(k.nasiyaLine, { months: plan.months, sum: fmtMoney(plan.monthly) })}</span></div>
            {nextDue && sale.remainingAmount > 0 && (
              <div className="sl-rc-line"><span>{d.sales.nextPayment}</span><span>{fmtDate(nextDue.dueDate)}</span></div>
            )}
          </>
        )}
        {!plan && sale.dueDate && sale.remainingAmount > 0 && (
          <div className="sl-rc-line"><span>{d.sales.dueDate}</span><span>{fmtDate(sale.dueDate)}</span></div>
        )}

        <hr className="sl-rc-cut" />

        <footer className="sl-rc-foot">
          <b>{k.thanks}</b>
          <span className="sl-rc-code">{sale.saleNo}</span>
        </footer>
      </article>
    </div>
  );
}
