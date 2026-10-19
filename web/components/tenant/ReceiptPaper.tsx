import type { ISale } from '@/lib/models/tenant/Sale';
import type { ShopSettings } from '@/lib/shopSettings';
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import { computeInstallmentPlan } from '@/lib/installment';
import type { Dict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';

type ReceiptSale = Pick<ISale, 'saleNo' | 'productSnapshot' | 'customerSnapshot' | 'paymentType' | 'bankName' | 'totalAmount' | 'paidAmount' | 'remainingAmount' | 'soldBy' | 'dueDate' | 'createdAt'> & Parameters<typeof computeInstallmentPlan>[0];

/**
 * Chek qog'ozi — bitta sotuv yoki kassadagi bir nechta qatorli sotuv (har qator — alohida Sale).
 * Ko'rinish do'kon sozlamalaridan: sarlavha/pastki matn, sotuvchi va mijoz (qog'oz kengligi — PrintReceiptButton).
 */
export default function ReceiptPaper({ sales, org, receipt, d }: {
  sales: ReceiptSale[];
  org: { name: string; phone?: string };
  receipt: ShopSettings['receipt'];
  d: Dict;
}) {
  const k = d.sales.receipt;
  const first = sales[0];
  const total = sales.reduce((s, x) => s + x.totalAmount, 0);
  const paid = sales.reduce((s, x) => s + x.paidAmount, 0);
  const remaining = sales.reduce((s, x) => s + x.remainingAmount, 0);
  const sameType = sales.every((x) => x.paymentType === first.paymentType);
  // Nasiya jadvali faqat bitta sotuvli chekda (kassa cheki — doim naqd)
  const plan = sales.length === 1 && first.paymentType === 'installment' ? computeInstallmentPlan(first) : null;
  const nextDue = plan?.schedule.find((m) => !m.paid);
  const customer = receipt.showCustomer ? first.customerSnapshot?.fullName : undefined;
  const phone = receipt.showCustomer ? first.customerSnapshot?.phone : undefined;
  const no = sales.length > 1 ? `${first.saleNo} – ${sales[sales.length - 1].saleNo}` : first.saleNo;

  return (
    <article className="sl-receipt-paper" aria-label={k.title}>
      <header className="sl-rc-head">
        <span className="sl-rc-mark" aria-hidden>{org.name.trim().charAt(0).toUpperCase() || 'S'}</span>
        <strong>{org.name}</strong>
        {receipt.headerNote && <span>{receipt.headerNote}</span>}
        {org.phone && <span>Tel: {org.phone}</span>}
        <span className="sl-rc-title">{k.title}</span>
      </header>

      <hr className="sl-rc-cut" />

      <dl className="sl-rc-meta">
        <dt>{k.no}</dt><dd>{no}</dd>
        <dt>{d.common.date}</dt><dd>{fmtDateTime(first.createdAt!)}</dd>
        {receipt.showSeller && (<><dt>{k.seller}</dt><dd>{first.soldBy}</dd></>)}
        {customer && (<><dt>{d.common.customer}</dt><dd>{customer}</dd></>)}
        {phone && (<><dt>{d.common.phone}</dt><dd>{phone}</dd></>)}
      </dl>

      <hr className="sl-rc-cut" />

      <div className="sl-rc-items">
        {sales.map((s) => {
          const qty = s.productSnapshot.saleQuantity ?? 1;
          const unit = qty > 0 ? Math.round(s.totalAmount / qty) : s.totalAmount;
          return (
            <div key={s.saleNo} className="sl-rc-item">
              <div className="sl-rc-item-top">
                <b>{s.productSnapshot.name}</b>
                <strong>{fmtMoney(s.totalAmount)}</strong>
              </div>
              {qty > 1 && <small>{qty} × {fmtMoney(unit)}</small>}
              {s.productSnapshot.imei && <small>{tr(k.code, { code: s.productSnapshot.imei })}</small>}
            </div>
          );
        })}
      </div>

      <hr className="sl-rc-cut" />

      <div className="sl-rc-total">
        <span>{k.total}</span>
        <strong>{fmtMoney(total)} {d.common.sum}</strong>
      </div>
      {sameType && <div className="sl-rc-line"><span>{d.sales.paymentType}</span><span>{d.sales.paymentTypesFull[first.paymentType]}</span></div>}
      {sales.length === 1 && first.paymentType === 'bank_credit' && first.bankName && (
        <div className="sl-rc-line"><span>{d.sales.detail.bank}</span><span>{first.bankName}</span></div>
      )}
      <div className="sl-rc-line"><span>{d.common.paid}</span><span>{fmtMoney(paid)} {d.common.sum}</span></div>
      {remaining > 0 && (
        <div className="sl-rc-line sl-rc-rem"><span>{d.common.remaining}</span><span>{fmtMoney(remaining)} {d.common.sum}</span></div>
      )}
      {plan && (
        <>
          <div className="sl-rc-line"><span>{d.common.installment}</span><span>{tr(k.nasiyaLine, { months: plan.months, sum: fmtMoney(plan.monthly) })}</span></div>
          {nextDue && first.remainingAmount > 0 && (
            <div className="sl-rc-line"><span>{d.sales.nextPayment}</span><span>{fmtDate(nextDue.dueDate)}</span></div>
          )}
        </>
      )}
      {!plan && sales.length === 1 && first.dueDate && first.remainingAmount > 0 && (
        <div className="sl-rc-line"><span>{d.sales.dueDate}</span><span>{fmtDate(first.dueDate)}</span></div>
      )}

      <hr className="sl-rc-cut" />

      <footer className="sl-rc-foot">
        <b>{receipt.footer || k.thanks}</b>
        <span className="sl-rc-code">{first.saleNo}</span>
      </footer>
    </article>
  );
}
