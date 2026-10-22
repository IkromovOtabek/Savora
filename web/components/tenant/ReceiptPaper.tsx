import type { ISale } from '@/lib/models/tenant/Sale';
import type { ShopSettings } from '@/lib/shopSettings';
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import { computeInstallmentPlan } from '@/lib/installment';
import type { Dict } from '@/lib/i18n/server';
import { qtyWithUnit, tr } from '@/lib/i18n/fmt';
import { isFractionalUnit } from '@/lib/qty';
import { PAY_METHODS, methodOf, type PayMethod } from '@/lib/payMethods';

type ReceiptSale = Pick<ISale, 'saleNo' | 'productSnapshot' | 'customerSnapshot' | 'paymentType' | 'bankName' | 'totalAmount' | 'paidAmount' | 'remainingAmount' | 'soldBy' | 'dueDate' | 'createdAt' | 'discount'> & Parameters<typeof computeInstallmentPlan>[0];

/**
 * Chek qog'ozi — bitta sotuv yoki kassadagi bir nechta qatorli sotuv (har qator — alohida Sale).
 * Ko'rinish do'kon sozlamalaridan: sarlavha/pastki matn, sotuvchi va mijoz (qog'oz kengligi — PrintReceiptButton).
 */
export default function ReceiptPaper({ sales, org, receipt, d, publicView = false }: {
  sales: ReceiptSale[];
  org: { name: string; phone?: string };
  receipt: ShopSettings['receipt'];
  d: Dict;
  /** Ochiq havola (/r/…) — mijoz telefoni ko'rsatilmaydi */
  publicView?: boolean;
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
  const phone = receipt.showCustomer && !publicView ? first.customerSnapshot?.phone : undefined;
  const no = sales.length > 1 ? `${first.saleNo} – ${sales[sales.length - 1].saleNo}` : first.saleNo;
  const discount = sales.reduce((s, x) => s + (x.discount ?? 0), 0);
  // Jami mahsulotlar soni: kasr birlik (kg/m…) aralashsa — qatorlar soni
  const fractional = sales.some((x) => isFractionalUnit(x.productSnapshot.unit));
  const itemsCount = fractional ? sales.length : sales.reduce((s, x) => s + (x.productSnapshot.saleQuantity ?? 1), 0);
  // To'lov usullari bo'yicha (eski yozuvlar — naqd)
  const byMethod = new Map<PayMethod, number>();
  for (const x of sales) for (const p of x.payments ?? []) byMethod.set(methodOf(p), (byMethod.get(methodOf(p)) ?? 0) + p.amount);
  const methods = PAY_METHODS.filter((m) => (byMethod.get(m) ?? 0) > 0);

  return (
    <article className="sl-receipt-paper" aria-label={k.title}>
      <header className="sl-rc-head">
        <span className="sl-rc-mark" aria-hidden>{org.name.trim().charAt(0).toUpperCase() || 'S'}</span>
        <strong>{org.name}</strong>
        {receipt.headerNote && <span>{receipt.headerNote}</span>}
        {org.phone && <span>Tel: {org.phone}</span>}
        {receipt.workHours && <span>{k.workHours}: {receipt.workHours}</span>}
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
          // Birlik narx — chegirmadan oldingi (chekda "1 dona × 15 000", chegirma alohida)
          const before = s.totalAmount + (s.discount ?? 0);
          const unit = qty > 0 ? Math.round(before / qty) : before;
          return (
            <div key={s.saleNo} className="sl-rc-item">
              <div className="sl-rc-item-top">
                <b>{s.productSnapshot.name}</b>
                <strong>{fmtMoney(s.totalAmount)}</strong>
              </div>
              <small>{qtyWithUnit(qty, s.productSnapshot.unit, d.stock.fields.units)} × {fmtMoney(unit)}{s.discount ? ` − ${fmtMoney(s.discount)}` : ''}</small>
              {s.productSnapshot.imei && <small>{tr(k.code, { code: s.productSnapshot.imei })}</small>}
            </div>
          );
        })}
      </div>

      <hr className="sl-rc-cut" />

      <div className="sl-rc-line"><span>{k.itemsCount}</span><span>{fractional ? tr(d.common.nPcs, { n: itemsCount }) : qtyWithUnit(itemsCount, null, d.stock.fields.units)}</span></div>
      {discount > 0 && (
        <>
          <div className="sl-rc-line"><span>{k.subtotal}</span><span>{fmtMoney(total + discount)} {d.common.sum}</span></div>
          <div className="sl-rc-line"><span>{k.discount}</span><span>− {fmtMoney(discount)} {d.common.sum}</span></div>
        </>
      )}

      <div className="sl-rc-total">
        <span>{k.total}</span>
        <strong>{fmtMoney(total)} {d.common.sum}</strong>
      </div>
      {/* Naqd/karta sotuvda — usullar bo'yicha; qarz/nasiya/kreditda — turi va to'langan qismi usullari */}
      {sameType && first.paymentType !== 'cash' && <div className="sl-rc-line"><span>{d.sales.paymentType}</span><span>{d.sales.paymentTypesFull[first.paymentType]}</span></div>}
      {methods.map((m) => (
        <div key={m} className="sl-rc-line"><span>{d.sales.payMethods[m]}</span><span>{fmtMoney(byMethod.get(m) ?? 0)} {d.common.sum}</span></div>
      ))}
      {sales.length === 1 && first.paymentType === 'bank_credit' && first.bankName && (
        <div className="sl-rc-line"><span>{d.sales.detail.bank}</span><span>{first.bankName}</span></div>
      )}
      {(remaining > 0 || methods.length === 0) && <div className="sl-rc-line"><span>{d.common.paid}</span><span>{fmtMoney(paid)} {d.common.sum}</span></div>}
      {remaining > 0 && (
        <div className="sl-rc-line sl-rc-rem"><span>{first.paymentType === 'debt' ? k.debtLine : d.common.remaining}</span><span>{fmtMoney(remaining)} {d.common.sum}</span></div>
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
