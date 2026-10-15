import { getTenantSession } from '@/lib/tenantSession';
import { branchFilter } from '@/lib/branchScope';
import { fmtMoney, fmtDate } from '@/lib/format';
import type { LedgerEntryDoc } from '@/lib/models/tenant/LedgerEntry';
import DaftarForm, { DaftarDeleteButton } from '@/components/tenant/DaftarForm';
import Icon from '@/components/icons/Icon';
import Tilt from '@/components/ui/Tilt';
import { Avatar, EmptyState, Pill } from '@/components/tenant/ClientsUi';
import { returnDaftarAction } from '@/app/actions/daftar';
import '@/components/tenant/styles/clients.css';

export const metadata = { title: 'Daftar — Savora' };

const DAY = 24 * 60 * 60 * 1000;

export default async function DaftarPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const sp = await searchParams;
  const { user, LedgerEntry } = await getTenantSession();

  const entries = await LedgerEntry.find({ ...branchFilter(user) }).sort({ status: 1, dueDate: 1 }).limit(300).lean();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  /** Qaytarish kunigacha qolgan kun (manfiy = kechikkan) */
  const daysLeft = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return Math.round((x.getTime() - today.getTime()) / DAY);
  };

  const open = entries.filter((e) => e.status === 'open');
  const closed = entries.filter((e) => e.status !== 'open');
  const given = open.filter((e) => e.type === 'given');
  const taken = open.filter((e) => e.type === 'taken');
  const givenSum = given.reduce((a, e) => a + (e.amount || 0), 0);
  const takenSum = taken.reduce((a, e) => a + (e.amount || 0), 0);
  const balance = givenSum - takenSum;
  const overdueCount = open.filter((e) => new Date(e.dueDate) < today).length;
  // Eslatmalar: muddati o'tgan yoki 3 kun ichida qaytishi kerak bo'lganlar
  const reminders = open.filter((e) => daysLeft(e.dueDate) <= 3);

  function dueLabel(e: LedgerEntryDoc) {
    const d = daysLeft(e.dueDate);
    if (d < 0) return { tone: 'bad' as const, text: `${Math.abs(d)} kun kechikdi` };
    if (d === 0) return { tone: 'warn' as const, text: 'Bugun' };
    if (d <= 3) return { tone: 'warn' as const, text: `${d} kun qoldi` };
    return { tone: 'mut' as const, text: fmtDate(e.dueDate) };
  }

  function Entry({ e }: { e: LedgerEntryDoc }) {
    const due = dueLabel(e);
    const id = String(e._id);
    return (
      <li className={`cl-lentry${due.tone === 'bad' ? ' cl-lentry--late' : ''}`}>
        <Avatar name={e.personName} />
        <div className="cl-lentry-main">
          <b className="cl-row-name">{e.personName}</b>
          <small className="cl-row-sub">
            <a href={`tel:${e.personPhone}`} className="t-num">{e.personPhone}</a>
            {e.note ? ` · ${e.note}` : ''}
          </small>
          <span className="cl-lentry-due">
            <Pill tone={due.tone}>{due.text}</Pill>
            {/* Uzoq muddatda pill sanani o'zi ko'rsatadi — takrorlanmasin */}
            {due.tone !== 'mut' && <small className="t-num">Qaytarish: {fmtDate(e.dueDate)}</small>}
          </span>
        </div>
        <div className="cl-lentry-side">
          <b className="cl-row-amt t-num">{fmtMoney(e.amount)}</b>
          <div className="cl-lentry-act">
            <form action={returnDaftarAction}>
              <input type="hidden" name="id" value={id} />
              <button type="submit" className="btn btn-tinted btn-sm btn-with-icon" aria-label={`${e.personName}: qaytdi deb belgilash`}>
                <Icon name="check" size={14} /> Qaytdi
              </button>
            </form>
            <DaftarDeleteButton id={id} name={e.personName} />
          </div>
        </div>
      </li>
    );
  }

  return (
    <div className="cl-page">
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">Daftar</h1>
          <p className="t-page-sub">Shaxsiy qarz oldi-berdi va muddat eslatmasi</p>
        </div>
      </div>
      <a href="#d-form" className="ux-fab" aria-label="Daftarga yangi yozuv qo'shish">
        <Icon name="plus" size={18} /> Yozuv
      </a>

      {sp.created === '1' && (
        <p className="cl-flash" role="status"><Icon name="check" size={16} /> Yozuv daftarga qo&apos;shildi</p>
      )}

      <div className="cl-daftar-top">
        <section className="cl-balance-box" aria-label="Daftar balansi">
          <Tilt className="cl-card cl-balance" max={4}>
            <span className="cl-eyebrow">Sof balans</span>
            <span className={`cl-balance-v t-num ux-z${balance > 0 ? ' cl-c-ok' : balance < 0 ? ' cl-c-bad' : ''}`}>
              {balance > 0 ? '+' : ''}{fmtMoney(balance)} <small>so&apos;m</small>
            </span>
            <span className="cl-hero-s">{balance >= 0 ? 'Sizga qaytarilishi kerak bo‘lgan ortiqcha summa' : 'Siz qaytarishingiz kerak bo‘lgan ortiqcha summa'}</span>
            <div className="cl-balance-split">
              <div className="cl-balance-col cl-balance-col--given">
                <span><Icon name="arrowRight" size={14} /> Men berdim</span>
                <b className="t-num">{fmtMoney(givenSum)}</b>
                <small>{given.length} ta · olinishi kerak</small>
              </div>
              <div className="cl-balance-col cl-balance-col--taken">
                <span><Icon name="arrowLeft" size={14} /> Men oldim</span>
                <b className="t-num">{fmtMoney(takenSum)}</b>
                <small>{taken.length} ta · qaytarilishi kerak</small>
              </div>
            </div>
            {open.length > 0 && <Progress2 given={givenSum} taken={takenSum} />}
  
            {reminders.length > 0 && (
              <div className="cl-reminders" role="status">
                <b><Icon name="bell" size={15} /> Muddat eslatmalari · {reminders.length}{overdueCount > 0 ? ` (${overdueCount} ta kechikkan)` : ''}</b>
                <ul>
                  {reminders.slice(0, 5).map((e) => {
                    const due = dueLabel(e);
                    return (
                      <li key={String(e._id)}>
                        <span>{e.type === 'given' ? 'Undirish' : 'Qaytarish'}: <b>{e.personName}</b></span>
                        <span className="t-num">{fmtMoney(e.amount)}</span>
                        <Pill tone={due.tone}>{due.text}</Pill>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </Tilt>
        </section>

        <DaftarForm />
      </div>

      {open.length === 0 && closed.length === 0 ? (
        <div className="cl-card">
          <EmptyState icon="clipboard" title="Hali yozuv yo‘q" text="Kimgadir qarz bersangiz yoki olsangiz, «Yangi yozuv» formasi orqali yozib qo‘ying — muddatida eslatamiz." />
        </div>
      ) : (
        <div className="cl-ledger-wrap">
          {/* Mobilda ikki uzun ro'yxat ustma-ust emas — "Men berdim / Men oldim" almashtirgichi (JS'siz, radio) */}
          <input type="radio" name="cl-lt" id="lt-given" className="cl-lt-in" defaultChecked />
          <input type="radio" name="cl-lt" id="lt-taken" className="cl-lt-in" />
          <div className="cl-lswitch">
            <label htmlFor="lt-given" className="cl-lswitch-given">
              Men berdim <span className="t-num">{given.length}</span>
            </label>
            <label htmlFor="lt-taken" className="cl-lswitch-taken">
              Men oldim <span className="t-num">{taken.length}</span>
            </label>
          </div>
          <div className="cl-ledger">
            <section className="cl-lcol cl-lcol--given" aria-labelledby="lc-given">
              <header className="cl-lcol-h">
                <h2 id="lc-given">Men berdim</h2>
                <b className="t-num">{fmtMoney(givenSum)}</b>
              </header>
              {given.length === 0 ? (
                <p className="cl-lcol-empty">Ochiq yozuv yo&apos;q</p>
              ) : (
                <ul className="cl-card cl-lcol-list">{given.map((e) => <Entry key={String(e._id)} e={e} />)}</ul>
              )}
            </section>
            <section className="cl-lcol cl-lcol--taken" aria-labelledby="lc-taken">
              <header className="cl-lcol-h">
                <h2 id="lc-taken">Men oldim</h2>
                <b className="t-num">{fmtMoney(takenSum)}</b>
              </header>
              {taken.length === 0 ? (
                <p className="cl-lcol-empty">Ochiq yozuv yo&apos;q</p>
              ) : (
                <ul className="cl-card cl-lcol-list">{taken.map((e) => <Entry key={String(e._id)} e={e} />)}</ul>
              )}
            </section>
          </div>
        </div>
      )}

      {closed.length > 0 && (
        <details className="cl-closed">
          <summary>Yopilgan yozuvlar <span className="t-num">{closed.length}</span></summary>
          <ul className="cl-card cl-lcol-list">
            {closed.map((e) => (
              <li key={String(e._id)} className="cl-lentry cl-lentry--done">
                <Avatar name={e.personName} />
                <div className="cl-lentry-main">
                  <b className="cl-row-name">{e.personName}</b>
                  <small className="cl-row-sub">
                    {e.type === 'given' ? 'Men berdim' : 'Men oldim'}
                    {e.returnedAt ? ` · qaytdi ${fmtDate(e.returnedAt)}` : ''}
                  </small>
                </div>
                <div className="cl-lentry-side">
                  <b className="cl-row-amt t-num">{fmtMoney(e.amount)}</b>
                  <Pill tone="ok">Yopilgan</Pill>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Berilgan va olingan qarz nisbati — ikki rangli chiziq */
function Progress2({ given, taken }: { given: number; taken: number }) {
  const total = given + taken;
  const g = total > 0 ? Math.round((given / total) * 100) : 50;
  return (
    <div className="cl-split-bar" aria-hidden="true">
      <i className="cl-split-bar--given" style={{ width: `${g}%` }} />
      <i className="cl-split-bar--taken" style={{ width: `${100 - g}%` }} />
    </div>
  );
}
