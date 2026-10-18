import { getTenantSession } from '@/lib/tenantSession';
import { isBranchScoped } from '@/lib/branchScope';
import { userCan } from '@/lib/permissionGuard';
import { computeShiftTotals, type ShiftTotals } from '@/lib/cashShift';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import { OpenShiftForm, CloseShiftForm } from '@/components/tenant/ShiftForms';
import Icon from '@/components/icons/Icon';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import '@/components/tenant/styles/shifts.css';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.sales.shifts.metaTitle };
}

export default async function ShiftsPage() {
  const { user, Branch, CashShift, Sale, CashFlow } = await getTenantSession();
  const d = await getDict();
  const k = d.sales.shifts;
  const scoped = isBranchScoped(user);
  const canShift = await userCan(user, 'kassa.shift');

  const branches = (await Branch.find({ active: true }).sort({ createdAt: 1 }).select('name').lean())
    .filter((b) => !scoped || String(b._id) === user.branchId);
  const branchIds = branches.map((b) => b._id);
  const branchName = new Map(branches.map((b) => [String(b._id), b.name]));

  const [open, closed] = await Promise.all([
    CashShift.find({ status: 'open', branchId: { $in: branchIds } }).sort({ openedAt: 1 }).lean(),
    CashShift.find({ status: 'closed', branchId: { $in: branchIds } }).sort({ closedAt: -1 }).limit(30).lean(),
  ]);

  // Ochiq smenalar: joriy kassa — ochilishdan hozirgacha bo'lgan naqd harakatlar
  const now = new Date();
  const openRows: { s: (typeof open)[number]; t: ShiftTotals }[] = await Promise.all(open.map(async (s) => {
    const from = new Date(s.openedAt);
    const [sales, flows] = await Promise.all([
      Sale.find({ branchId: s.branchId, $or: [{ 'payments.paidAt': { $gte: from } }, { 'returns.returnedAt': { $gte: from } }] }).lean(),
      CashFlow.find({ branchId: s.branchId, type: 'expense', createdAt: { $gte: from } }).select('type amount createdAt').lean(),
    ]);
    return { s, t: computeShiftTotals(sales, flows, s.openingCash, from, now) };
  }));

  const openBranchIds = new Set(open.map((s) => String(s.branchId)));
  const freeBranches = branches.filter((b) => !openBranchIds.has(String(b._id))).map((b) => ({ id: String(b._id), name: b.name }));
  const sum = (n: number) => <>{fmtMoney(n)} <small>{d.common.sum}</small></>;

  return (
    <>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{k.title}</h1>
          <p className="t-page-sub">{k.sub}</p>
        </div>
      </div>

      {branches.length === 0 ? (
        <div className="ux-empty sh-empty">
          <span className="ux-empty-ic"><Icon name="building" size={26} /></span>
          <p>{k.noBranches}</p>
        </div>
      ) : (
        <div className="t-split">
          {canShift && (
            <aside className="t-split-rail sh-rail">
              {freeBranches.length > 0
                ? <OpenShiftForm branches={freeBranches} />
                : <p className="sh-allopen"><Icon name="check" size={16} />{k.allOpen}</p>}
            </aside>
          )}

          <div className="t-split-main">
            <h2 className="sh-h">{k.openList} <span>{open.length}</span></h2>
            {openRows.length === 0 ? (
              <div className="ux-empty sh-empty">
                <span className="ux-empty-ic"><Icon name="clock" size={26} /></span>
                <b>{k.emptyOpen}</b>
                <p>{k.emptyOpenHint}</p>
              </div>
            ) : (
              <ul className="sh-list">
                {openRows.map(({ s, t }) => (
                  <li key={String(s._id)} className="sh-row sh-row--open">
                    <div className="sh-row-grid">
                      <span className="sh-no">{s.shiftNo}</span>
                      <span className="sh-branch">{branchName.get(String(s.branchId)) ?? '—'}</span>
                      <span className="sh-status">
                        <span className="sh-dot" aria-hidden="true" />
                        <span>
                          <b>{k.statusOpen}</b>
                          <small>{tr(k.since, { t: fmtDateTime(s.openedAt) })} · {s.openedBy}</small>
                        </span>
                      </span>
                      <span className="sh-money">
                        <small>{k.colOpening}</small>
                        <b>{sum(s.openingCash)}</b>
                      </span>
                      <span className="sh-money sh-money--main">
                        <small>{k.colCurrent}</small>
                        <b>{sum(t.current)}</b>
                      </span>
                    </div>
                    <dl className="sh-breakdown">
                      <div><dt>{k.cashIn}</dt><dd className="sh-plus">+ {fmtMoney(t.cashIn)}</dd></div>
                      <div><dt>{k.refunds}</dt><dd>− {fmtMoney(t.refunds)}</dd></div>
                      <div><dt>{k.withdrawals}</dt><dd>− {fmtMoney(t.withdrawals)}</dd></div>
                    </dl>
                    {canShift && (
                      <details className="sh-details">
                        <summary className="btn btn-ghost btn-sm">{k.closeBtn}</summary>
                        <CloseShiftForm shiftId={String(s._id)} expected={t.current} />
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <h2 className="sh-h sh-h--history">{k.history}</h2>
            {closed.length === 0 ? (
              <div className="ux-empty sh-empty"><p>{k.emptyHistory}</p></div>
            ) : (
              <div className="table-wrap sh-table-wrap">
                <table className="data-table sh-table">
                  <thead>
                    <tr>
                      <th>{k.colNo}</th>
                      <th>{k.colBranch}</th>
                      <th>{k.colStatus}</th>
                      <th className="num">{k.colOpening}</th>
                      <th className="num">{k.expected}</th>
                      <th className="num">{k.counted}</th>
                      <th className="num">{k.colDiff}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closed.map((s) => {
                      const diff = s.difference ?? 0;
                      return (
                        <tr key={String(s._id)}>
                          <td className="cell-main">{s.shiftNo}</td>
                          <td>{branchName.get(String(s.branchId)) ?? '—'}</td>
                          <td>
                            <div>{fmtDateTime(s.openedAt)} → {s.closedAt ? fmtDateTime(s.closedAt) : '—'}</div>
                            <div className="cell-sub">{s.openedBy}{s.closedBy && s.closedBy !== s.openedBy ? ` → ${s.closedBy}` : ''}{s.note ? ` · ${s.note}` : ''}</div>
                          </td>
                          <td className="num">{fmtMoney(s.openingCash)}</td>
                          <td className="num">{fmtMoney(s.expectedCash ?? 0)}</td>
                          <td className="num">{fmtMoney(s.countedCash ?? 0)}</td>
                          <td className="num">
                            <span className={`sh-pill${diff === 0 ? ' sh-pill--ok' : diff < 0 ? ' sh-pill--bad' : ' sh-pill--warn'}`}>
                              {diff === 0 ? k.diffOk : `${diff > 0 ? '+' : '−'} ${fmtMoney(Math.abs(diff))}`}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
