import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { branchFilter } from '@/lib/branchScope';
import { fmtMoney, fmtDate } from '@/lib/format';
import { computeInstallmentPlan } from '@/lib/installment';

export const metadata = { title: 'Variant (Nasiya) — Savora' };

export default async function NasiyaPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const sp = await searchParams;
  const { user, Sale } = await getTenantSession();
  const now = new Date();

  // Faqat nasiya (bo'lib to'lash) sotuvlari — filial login faqat o'z filialini ko'radi
  const sales = await Sale.find({ ...branchFilter(user), paymentType: 'installment', status: { $ne: 'cancelled' } })
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  // Har sotuv uchun oy jadvali (boshlang'ich, oylik, to'langan oylar)
  const rows = sales.map((s) => {
    const plan = computeInstallmentPlan(s, now);
    return {
      s,
      down: plan?.down ?? 0,
      monthly: plan?.monthly ?? 0,
      monthsPaid: plan?.monthsPaid ?? 0,
      months: s.installmentMonths ?? 0,
      overdue: (plan?.overdueCount ?? 0) > 0,
      isPaid: s.status === 'paid' || s.remainingAmount === 0,
    };
  });

  const paidRows = rows.filter((r) => r.isPaid);
  const debtRows = rows.filter((r) => !r.isPaid);
  const sumTotal = rows.reduce((a, r) => a + r.s.totalAmount, 0);
  const sumPaidTotal = paidRows.reduce((a, r) => a + r.s.totalAmount, 0);
  const sumDebtRemaining = debtRows.reduce((a, r) => a + r.s.remainingAmount, 0);

  const f = sp.f; // '' | 'paid' (tugatilgan) | 'debt' (qarzdor)
  const shown = f === 'paid' ? paidRows : f === 'debt' ? debtRows : rows;

  return (
    <>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">Variant (Nasiya)</h1>
          <p className="t-page-sub">Bo&apos;lib to&apos;lash savdolari</p>
        </div>
        <Link href="/app/sales/new" className="btn btn-primary">+ Yangi sotuv</Link>
      </div>

      <div className="nf-tabs">
        <Link href="/app/nasiya" className={`nf-tab${!f ? ' nf-tab--active' : ''}`}>
          <span className="nf-tab-title">Hammasi</span>
          <span className="nf-tab-meta"><b>{rows.length} ta</b> · {fmtMoney(sumTotal)} UZS</span>
        </Link>
        <Link href="/app/nasiya?f=paid" className={`nf-tab${f === 'paid' ? ' nf-tab--active' : ''}`}>
          <span className="nf-tab-title nf-green">Tugatilgan</span>
          <span className="nf-tab-meta"><b>{paidRows.length} ta</b> · {fmtMoney(sumPaidTotal)} UZS</span>
        </Link>
        <Link href="/app/nasiya?f=debt" className={`nf-tab${f === 'debt' ? ' nf-tab--active' : ''}`}>
          <span className="nf-tab-title nf-amber">Qarzdor</span>
          <span className="nf-tab-meta"><b>{debtRows.length} ta</b> · {fmtMoney(sumDebtRemaining)} UZS</span>
        </Link>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        {shown.length === 0 ? (
          <div className="panel-empty"><p>Nasiya savdosi topilmadi.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Model</th>
                  <th>IMEI</th>
                  <th>Mijoz</th>
                  <th>Sotilgan narx</th>
                  <th>Boshlang&apos;ich</th>
                  <th>Muddat / to&apos;langan</th>
                  <th>Qolgan summa</th>
                  <th>Oylik</th>
                  <th>Sana</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={String(r.s._id)} className={!r.isPaid && r.overdue ? 'row-overdue' : ''}>
                    <td data-label="№">{i + 1}</td>
                    <td className="cell-main" data-label="Model">{r.s.productSnapshot.name}</td>
                    <td data-label="IMEI"><code className="imei-code">{r.s.productSnapshot.imei}</code></td>
                    <td data-label="Mijoz">{r.s.customerSnapshot?.fullName || '—'}</td>
                    <td data-label="Sotilgan narx">{fmtMoney(r.s.totalAmount)} UZS</td>
                    <td data-label="Boshlang'ich">{fmtMoney(r.down)} UZS</td>
                    <td data-label="Muddat / to'langan"><b>{r.months}</b> / {r.monthsPaid}</td>
                    <td className="cell-main" data-label="Qolgan summa">{fmtMoney(r.s.remainingAmount)} UZS</td>
                    <td data-label="Oylik">{fmtMoney(r.monthly)} UZS</td>
                    <td data-label="Sana">{fmtDate(r.s.createdAt!)}</td>
                    <td className="cell-actions" data-label="">
                      <Link href={`/app/sales/${r.s._id}`} className="btn btn-ghost btn-sm">Batafsil</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
