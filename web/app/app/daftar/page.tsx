import { getTenantSession } from '@/lib/tenantSession';
import { branchFilter } from '@/lib/branchScope';
import { fmtMoney, fmtDate } from '@/lib/format';
import { LEDGER_TYPE_LABELS, LedgerType } from '@/lib/models/tenant/LedgerEntry';
import DaftarForm from '@/components/tenant/DaftarForm';
import { returnDaftarAction, deleteDaftarAction } from '@/app/actions/daftar';

export const metadata = { title: 'Daftar — Savora' };

export default async function DaftarPage() {
  const { user, LedgerEntry } = await getTenantSession();

  const entries = await LedgerEntry.find({ ...branchFilter(user) }).sort({ status: 1, dueDate: 1 }).limit(300).lean();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const open = entries.filter((e) => e.status === 'open');
  const givenSum = open.filter((e) => e.type === 'given').reduce((a, e) => a + (e.amount || 0), 0);
  const takenSum = open.filter((e) => e.type === 'taken').reduce((a, e) => a + (e.amount || 0), 0);
  const overdueCount = open.filter((e) => new Date(e.dueDate) < today).length;

  return (
    <>
      <div className="dash-head">
        <div>
          <h1 className="dash-hello">Daftar</h1>
          <p className="dash-sub">Shaxsiy qarz oldi-berdi va muddat eslatmasi</p>
        </div>
      </div>

      <div className="dash-stats" style={{ marginBottom: 20 }}>
        <div className="dash-stat dash-stat--ok">
          <div className="dash-stat-n">{fmtMoney(givenSum)}</div>
          <div className="dash-stat-l">Berilgan qarz (olinishi kerak)</div>
        </div>
        <div className="dash-stat dash-stat--warn">
          <div className="dash-stat-n">{fmtMoney(takenSum)}</div>
          <div className="dash-stat-l">Olingan qarz (qaytarilishi kerak)</div>
        </div>
        <div className="dash-stat">
          <div className="dash-stat-n">{overdueCount}</div>
          <div className="dash-stat-l">Muddati o&apos;tgan</div>
        </div>
      </div>

      <DaftarForm />

      <div className="panel">
        <div className="panel-head"><h2>Yozuvlar</h2></div>
        {entries.length === 0 ? (
          <div className="panel-empty"><p>Hali yozuv yo&apos;q. Yuqoridagi forma orqali qo&apos;shing.</p></div>
        ) : (
          <div className="daftar-list">
            {entries.map((e) => {
              const overdue = e.status === 'open' && new Date(e.dueDate) < today;
              return (
                <div key={String(e._id)} className={`daftar-card${e.status === 'returned' ? ' daftar-card--done' : ''}`}>
                  <div className="daftar-card-top">
                    <span className={`badge-status badge-status--${e.type === 'given' ? 'active' : 'suspended'}`}>
                      {LEDGER_TYPE_LABELS[e.type as LedgerType]}
                    </span>
                    {e.status === 'returned'
                      ? <span className="daftar-tag daftar-tag--done">Yopilgan</span>
                      : overdue
                        ? <span className="daftar-tag daftar-tag--over">Muddati o&apos;tgan</span>
                        : <span className="daftar-tag">Muddat: {fmtDate(e.dueDate)}</span>}
                    <span className="daftar-amount">{fmtMoney(e.amount)} so&apos;m</span>
                  </div>
                  <div className="daftar-card-body">
                    <div className="daftar-person">{e.personName} · <a href={`tel:${e.personPhone}`}>{e.personPhone}</a></div>
                    <div className="daftar-meta">Qaytarish: {fmtDate(e.dueDate)}{e.note ? ` · ${e.note}` : ''}</div>
                  </div>
                  {e.status === 'open' && (
                    <div className="daftar-card-foot">
                      <form action={returnDaftarAction}>
                        <input type="hidden" name="id" value={String(e._id)} />
                        <button type="submit" className="btn btn-ghost btn-sm">Qaytdi</button>
                      </form>
                      <form action={deleteDaftarAction}>
                        <input type="hidden" name="id" value={String(e._id)} />
                        <button type="submit" className="btn btn-ghost btn-sm daftar-del">O&apos;chirish</button>
                      </form>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
