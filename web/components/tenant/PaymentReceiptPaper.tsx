import type { ISale, ISalePayment } from '@/lib/models/tenant/Sale';
import type { ShopSettings } from '@/lib/shopSettings';
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import { computeInstallmentPlan } from '@/lib/installment';
import type { Dict } from '@/lib/i18n/server';
import { qtyWithUnit, tr } from '@/lib/i18n/fmt';
import { methodOf } from '@/lib/payMethods';

const DOWN_NOTE = "Boshlang'ich to'lov";

/**
 * Bitta to'lov cheki (nasiya oylik to'lovi yoki qarz to'lovi): nima uchun, qaysi oy(lar), qanday usulda,
 * to'lovdan keyingi holat (jami to'langan, qoldiq), nasiyada — keyingi to'lov sanasi va summasi.
 * Ko'rinish (sarlavha/pastki matn, kassir, mijoz) — do'kon chek sozlamalaridan.
 */
export default function PaymentReceiptPaper({ sale, payment, index, org, receipt, d }: {
  sale: ISale;
  payment: ISalePayment;
  /** To'lovning sotuvdagi tartib raqami (0 dan) */
  index: number;
  org: { name: string; phone?: string };
  receipt: ShopSettings['receipt'];
  d: Dict;
}) {
  const k = d.sales.receipt;
  const isInst = sale.paymentType === 'installment';
  const isLast = index === sale.payments.length - 1;
  const paidUpTo = sale.payments.slice(0, index + 1).reduce((a, p) => a + p.amount, 0);
  // To'lovdan keyingi qoldiq: yozilgan bo'lsa — o'sha; eski yozuvda faqat oxirgi to'lov uchun aniq
  const balance = typeof payment.balanceAfter === 'number' ? payment.balanceAfter : isLast ? sale.remainingAmount : undefined;
  // Nasiya jadvali (keyingi to'lov, to'langan oylar) — joriy holat, shuning uchun faqat oxirgi to'lov chekida
  const plan = isInst && isLast ? computeInstallmentPlan(sale) : null;
  const next = plan?.schedule.find((m) => !m.paid);

  // To'lov maqsadi: oylar (yangi yozuv) → izoh (eski yozuv) → turi
  const isDown = payment.note === DOWN_NOTE;
  const mo = payment.months;
  const purpose = isDown
    ? k.downPaid
    : mo
      ? mo.from === mo.to
        ? tr(mo.partialLast ? k.forMonthPartial : k.forMonth, { n: mo.from })
        : tr(mo.partialLast ? k.forRangePartial : k.forRange, { from: mo.from, to: mo.to })
      : payment.note || (isInst ? k.forInstallment : k.forDebt);
  const carry = payment.carry;

  const customer = receipt.showCustomer ? sale.customerSnapshot?.fullName : undefined;
  const phone = receipt.showCustomer ? sale.customerSnapshot?.phone : undefined;
  const qty = sale.productSnapshot.saleQuantity ?? 1;

  return (
    <article className="sl-receipt-paper" aria-label={k.payTitle}>
      <header className="sl-rc-head">
        <span className="sl-rc-mark" aria-hidden>{org.name.trim().charAt(0).toUpperCase() || 'S'}</span>
        <strong>{org.name}</strong>
        {receipt.headerNote && <span>{receipt.headerNote}</span>}
        {org.phone && <span>Tel: {org.phone}</span>}
        {receipt.workHours && <span>{k.workHours}: {receipt.workHours}</span>}
        <span className="sl-rc-title">{k.payTitle}</span>
      </header>

      <hr className="sl-rc-cut" />

      <dl className="sl-rc-meta">
        <dt>{k.no}</dt><dd>{sale.saleNo}-{index + 1}</dd>
        <dt>{d.common.date}</dt><dd>{fmtDateTime(payment.paidAt)}</dd>
        {receipt.showSeller && payment.recordedBy && (<><dt>{k.cashier}</dt><dd>{payment.recordedBy}</dd></>)}
        {customer && (<><dt>{d.common.customer}</dt><dd>{customer}</dd></>)}
        {phone && (<><dt>{d.common.phone}</dt><dd>{phone}</dd></>)}
      </dl>

      <hr className="sl-rc-cut" />

      {/* Nima uchun: tovar va sotuv */}
      <div className="sl-rc-items">
        <div className="sl-rc-item">
          <div className="sl-rc-item-top">
            <b>{sale.productSnapshot.name}</b>
          </div>
          {qty !== 1 && <small>{qtyWithUnit(qty, sale.productSnapshot.unit, d.stock.fields.units)}</small>}
          {sale.productSnapshot.imei && <small>{tr(k.code, { code: sale.productSnapshot.imei })}</small>}
          <small>{k.saleNo} {sale.saleNo} · {fmtDate(sale.createdAt!)} · {d.sales.paymentTypesFull[sale.paymentType]}</small>
        </div>
      </div>

      <hr className="sl-rc-cut" />

      <div className="sl-rc-line"><span>{k.payFor}</span><span>{purpose}</span></div>
      {carry && carry.amount > 0 && (
        <div className="sl-rc-line">
          <span />
          <span>{tr(carry.from === carry.to ? k.carryOne : k.carryLine, { sum: fmtMoney(carry.amount), from: carry.from, to: carry.to })}</span>
        </div>
      )}
      <div className="sl-rc-line"><span>{d.sales.payForm.method}</span><span>{d.sales.payMethods[methodOf(payment)]}</span></div>

      <div className="sl-rc-total">
        <span>{k.paidNow}</span>
        <strong>{fmtMoney(payment.amount)} {d.common.sum}</strong>
      </div>

      <hr className="sl-rc-cut" />

      {/* To'lovdan keyingi holat */}
      <div className="sl-rc-line"><span>{k.saleTotal}</span><span>{fmtMoney(sale.totalAmount)} {d.common.sum}</span></div>
      {isInst && (sale.downPayment ?? 0) > 0 && !isDown && (
        <div className="sl-rc-line"><span>{k.downPaid}</span><span>{fmtMoney(sale.downPayment ?? 0)} {d.common.sum}</span></div>
      )}
      <div className="sl-rc-line"><span>{k.paidTotal}</span><span>{fmtMoney(paidUpTo)} {d.common.sum}</span></div>
      {balance !== undefined && (
        <div className="sl-rc-line sl-rc-rem"><span>{k.balance}</span><span>{fmtMoney(balance)} {d.common.sum}</span></div>
      )}
      {plan && (
        <div className="sl-rc-line"><span>{k.monthsPaid}</span><span>{plan.monthsPaid} / {plan.months}</span></div>
      )}
      {next && (balance ?? 0) > 0 && (
        <div className="sl-rc-line">
          <span>{k.nextPay}</span>
          <span>{tr(k.nextPayValue, { date: fmtDate(next.dueDate), sum: fmtMoney(next.left) })}</span>
        </div>
      )}

      <hr className="sl-rc-cut" />

      <footer className="sl-rc-foot">
        {balance === 0 && <b>{isInst ? k.fullyPaid : k.debtClosed}</b>}
        {balance !== 0 && <b>{receipt.footer || k.thanks}</b>}
        <span className="sl-rc-code">{sale.saleNo}-{index + 1}</span>
      </footer>
    </article>
  );
}
