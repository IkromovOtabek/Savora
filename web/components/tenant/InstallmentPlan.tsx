import { fmtDate, fmtMoney } from '@/lib/format';
import { InstallmentPlan as Plan } from '@/lib/installment';
import InstallmentMonths from './InstallmentMonths';

/** Nasiya to'lov jadvali — sotuv detali sahifasida ko'rsatiladi. */
export default function InstallmentPlan({
  plan,
  saleId,
  canPay,
}: {
  plan: Plan;
  saleId: string;
  canPay: boolean;
}) {
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
        <h2 id="sl-plan-h">Nasiya jadvali</h2>
        <small>{plan.monthsPaid} / {plan.months} oy to&apos;langan</small>
      </div>

      {/* To'langan / qoldiq / oylik summa hero kartada bor — bu yerda faqat jadvalga xos ma'lumot */}
      <div className="sl-plan-stats">
        <div className="sl-plan-stat">
          <span>Boshlang&apos;ich</span>
          <strong>{fmtMoney(plan.down)}</strong>
        </div>
        <div className="sl-plan-stat sl-plan-stat--gold">
          <span>Keyingi to&apos;lov</span>
          <strong>{next ? fmtMoney(nextLeft) : 'Yopilgan'}</strong>
          {next && <small>{next.month}-oy · {fmtDate(next.dueDate)}</small>}
        </div>
        {plan.overdueCount > 0 && (
          <div className="sl-plan-stat sl-plan-stat--danger">
            <span>Kechikkan</span>
            <strong>{plan.overdueCount} oy</strong>
          </div>
        )}
      </div>

      <div className="sl-plan-bar" role="img" aria-label={`Boshlang'ich ${Math.round(downPct)}%, oylik to'lovlar ${Math.round(monthlyPct)}%`}>
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
