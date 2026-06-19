import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { branchFilter } from '@/lib/branchScope';
import { fmtDate, fmtMoney } from '@/lib/format';
import { computeDebtInfo, DEBT_STATE_META, buildReminderText, DebtState } from '@/lib/debts';
import DebtReminderButton from '@/components/tenant/DebtReminderButton';

export const metadata = { title: 'Qarzdorlik — Savora' };

export default async function DebtsPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const sp = await searchParams;
  const { user, Sale, org } = await getTenantSession();

  // Faqat qarzdor (qisman to'langan) sotuvlar — filial login faqat o'z filiali
  const sales = await Sale.find({ ...branchFilter(user), status: 'partial', remainingAmount: { $gt: 0 } })
    .sort({ dueDate: 1, createdAt: -1 })
    .limit(500)
    .lean();

  const now = new Date();
  const rows = sales.map((s) => ({ sale: s, info: computeDebtInfo(s, now) }));

  // KPI
  const totalDebt = rows.reduce((a, r) => a + r.sale.remainingAmount, 0);
  const overdue = rows.filter((r) => r.info.state === 'overdue');
  const dueSoon = rows.filter((r) => r.info.state === 'due_soon');
  const overdueSum = overdue.reduce((a, r) => a + r.sale.remainingAmount, 0);

  // Filtr
  const f = sp.f;
  const filtered = rows.filter((r) => {
    if (f === 'overdue') return r.info.state === 'overdue';
    if (f === 'due_soon') return r.info.state === 'due_soon';
    if (f === 'no_date') return r.info.state === 'no_date';
    return true;
  });

  // Tartib: muddati o'tganlar birinchi
  const order: Record<DebtState, number> = { overdue: 0, due_soon: 1, on_track: 2, no_date: 3 };
  filtered.sort((a, b) => order[a.info.state] - order[b.info.state] || (a.info.daysLeft ?? 1e9) - (b.info.daysLeft ?? 1e9));

  return (
    <>
      <div className="dash-head">
        <div>
          <h1 className="dash-hello">Qarzdorlik nazorati</h1>
          <p className="dash-sub">Muddati o&apos;tgan va yaqinlashayotgan to&apos;lovlarni kuzating</p>
        </div>
        <Link href="/app/sales/new" className="btn btn-primary">+ Yangi sotuv</Link>
      </div>

      <div className="dash-stats">
        <div className="dash-stat">
          <div className="dash-stat-n">{fmtMoney(totalDebt)}</div>
          <div className="dash-stat-l">Jami qarzdorlik (so&apos;m)</div>
        </div>
        <div className="dash-stat dash-stat--warn">
          <div className="dash-stat-n">{overdue.length}</div>
          <div className="dash-stat-l">Muddati o&apos;tgan</div>
        </div>
        <div className="dash-stat dash-stat--warn">
          <div className="dash-stat-n">{fmtMoney(overdueSum)}</div>
          <div className="dash-stat-l">Muddati o&apos;tgan summa</div>
        </div>
        <div className="dash-stat">
          <div className="dash-stat-n">{dueSoon.length}</div>
          <div className="dash-stat-l">Muddati yaqin (≤7 kun)</div>
        </div>
      </div>

      <div className="filter-chips">
        <Link href="/app/debts" className={`chip${!f ? ' chip--active' : ''}`}>Barchasi ({rows.length})</Link>
        <Link href="/app/debts?f=overdue" className={`chip${f === 'overdue' ? ' chip--active' : ''}`}>Muddati o&apos;tgan ({overdue.length})</Link>
        <Link href="/app/debts?f=due_soon" className={`chip${f === 'due_soon' ? ' chip--active' : ''}`}>Yaqin ({dueSoon.length})</Link>
        <Link href="/app/debts?f=no_date" className={`chip${f === 'no_date' ? ' chip--active' : ''}`}>Muddatsiz</Link>
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        {filtered.length === 0 ? (
          <div className="panel-empty">
            <p>Qarzdor topilmadi. 🎉</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mijoz</th>
                  <th>Telefon</th>
                  <th>Mahsulot</th>
                  <th>Qoldiq</th>
                  <th>Muddat</th>
                  <th>Holat</th>
                  <th>Amallar</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ sale: s, info }) => {
                  const meta = DEBT_STATE_META[info.state];
                  const name = s.customerSnapshot?.fullName || '—';
                  const phone = s.customerSnapshot?.phone;
                  const text = buildReminderText({
                    shopName: org.name,
                    customerName: s.customerSnapshot?.fullName,
                    productName: s.productSnapshot.name,
                    remaining: s.remainingAmount,
                    dueDate: s.dueDate,
                    overdue: info.state === 'overdue',
                  });
                  return (
                    <tr key={String(s._id)} className={info.state === 'overdue' ? 'row-overdue' : ''}>
                      <td className="cell-main">{name}</td>
                      <td>{phone || '—'}</td>
                      <td>
                        <Link href={`/app/sales/${s._id}`} className="cell-link">{s.productSnapshot.name}</Link>
                      </td>
                      <td className="cell-main">{fmtMoney(s.remainingAmount)} so&apos;m</td>
                      <td>
                        {s.dueDate ? fmtDate(s.dueDate) : '—'}
                        <div className={`cell-sub${info.state === 'overdue' ? ' cell-sub--danger' : ''}`}>{info.label}</div>
                      </td>
                      <td><span className={`badge-status ${meta.cls}`}>{meta.label}</span></td>
                      <td className="cell-actions">
                        <div className="row-actions">
                          <Link href={`/app/sales/${s._id}`} className="btn btn-ghost btn-sm">To&apos;lov</Link>
                          <DebtReminderButton phone={phone} text={text} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
