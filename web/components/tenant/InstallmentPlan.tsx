import { fmtMoney } from '@/lib/format';
import { InstallmentPlan as Plan } from '@/lib/installment';
import InstallmentMonths from './InstallmentMonths';

/** Nasiya (variant) to'lov jadvali — sotuv detali sahifasida ko'rsatiladi. */
export default function InstallmentPlan({
  plan,
  saleId,
  canPay,
}: {
  plan: Plan;
  saleId: string;
  canPay: boolean;
}) {
  return (
    <div className="panel" style={{ marginTop: 20 }}>
      <div className="panel-head"><h2>Variant to&apos;lovlar</h2></div>

      <div className="dash-stats" style={{ padding: '18px 20px' }}>
        <div className="dash-stat">
          <div className="dash-stat-n">{fmtMoney(plan.total)} UZS</div>
          <div className="dash-stat-l">Sotilgan narx</div>
        </div>
        <div className="dash-stat">
          <div className="dash-stat-n">{fmtMoney(plan.down)} UZS</div>
          <div className="dash-stat-l">Boshlang&apos;ich</div>
        </div>
        <div className="dash-stat dash-stat--warn">
          <div className="dash-stat-n">{fmtMoney(plan.remaining)} UZS</div>
          <div className="dash-stat-l">Jami qolgan</div>
        </div>
        <div className="dash-stat">
          <div className="dash-stat-n" style={{ color: '#2563eb' }}>{fmtMoney(plan.monthly)} UZS</div>
          <div className="dash-stat-l">Oylik to&apos;lov</div>
        </div>
        <div className="dash-stat dash-stat--ok">
          <div className="dash-stat-n">{plan.monthsPaid} / {plan.months} oy</div>
          <div className="dash-stat-l">To&apos;langan</div>
        </div>
        <div className="dash-stat">
          <div className="dash-stat-n" style={{ color: '#dc2626' }}>{fmtMoney(plan.remaining)} UZS</div>
          <div className="dash-stat-l">Qolgan summa</div>
        </div>
      </div>

      <InstallmentMonths
        saleId={saleId}
        schedule={plan.schedule}
        remaining={plan.remaining}
        canPay={canPay}
      />
    </div>
  );
}
