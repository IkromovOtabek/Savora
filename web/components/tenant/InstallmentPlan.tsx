import { fmtDate, fmtMoney } from '@/lib/format';
import { InstallmentPlan as Plan } from '@/lib/installment';
import InstallmentMonths from './InstallmentMonths';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';

/** Nasiya to'lov jadvali — sotuv detali sahifasida ko'rsatiladi. */
export default async function InstallmentPlan({
  plan,
  saleId,
  canPay,
}: {
  plan: Plan;
  saleId: string;
  canPay: boolean;
}) {
  const d = await getDict();
  const financed = Math.max(0, plan.total - plan.down);
  const paidMonthly = Math.max(0, plan.paid - plan.down);
  const downPct = plan.total > 0 ? (plan.down / plan.total) * 100 : 0;
  const monthlyPct = plan.total > 0 ? (Math.min(paidMonthly, financed) / plan.total) * 100 : 0;
  // Navbatdagi (birinchi to'lanmagan) oy — jadvalda ajratib ko'rsatiladi
  const next = plan.schedule.find((m) => !m.paid);
  const nextLeft = next ? Math.max(0, next.amount - next.paidAmount) : 0;

  return (
    <section className="sl-card" aria-labelledby="sl-plan-h">
      <div className="sl-card-head">
        <h2 id="sl-plan-h">{d.sales.installment.planTitle}</h2>
        <small>{tr(d.sales.installment.paidOf, { paid: plan.monthsPaid, total: plan.months })}</small>
      </div>

      {/* To'langan / qoldiq / oylik summa hero kartada bor — bu yerda faqat jadvalga xos ma'lumot */}
      <div className="sl-plan-stats">
        <div className="sl-plan-stat">
          <span>{d.sales.down}</span>
          <strong>{fmtMoney(plan.down)}</strong>
        </div>
        <div className="sl-plan-stat sl-plan-stat--gold">
          <span>{d.sales.nextPayment}</span>
          <strong>{next ? fmtMoney(nextLeft) : d.sales.installment.closed}</strong>
          {next && <small>{tr(d.sales.monthN, { n: next.month })} · {fmtDate(next.dueDate)}</small>}
        </div>
        {plan.overdueCount > 0 && (
          <div className="sl-plan-stat sl-plan-stat--danger">
            <span>{d.sales.installment.overdue}</span>
            <strong>{tr(d.common.nMonths, { n: plan.overdueCount })}</strong>
          </div>
        )}
      </div>

      <div className="sl-plan-bar" role="img" aria-label={tr(d.sales.installment.barAria, { down: Math.round(downPct), monthly: Math.round(monthlyPct) })}>
        <i style={{ width: `${downPct}%` }} />
        <i style={{ width: `${monthlyPct}%` }} />
      </div>

      <InstallmentMonths
        saleId={saleId}
        schedule={plan.schedule}
        remaining={plan.remaining}
        canPay={canPay}
      />
    </section>
  );
}
