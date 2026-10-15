import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { branchFilter } from '@/lib/branchScope';
import { fmtDate, fmtMoney } from '@/lib/format';
import { computeDebtInfo, buildReminderText, DebtState } from '@/lib/debts';
import DebtReminderButton from '@/components/tenant/DebtReminderButton';
import Icon, { type IconName } from '@/components/icons/Icon';
import { Avatar, EmptyState, Pill, type PillTone } from '@/components/tenant/ClientsUi';
import '@/components/tenant/styles/clients.css';

export const metadata = { title: 'Qarzdorlik — Savora' };

/** Guruhlar — muhimlik tartibida */
const GROUPS: { state: DebtState; title: string; hint: string; icon: IconName; tone: PillTone }[] = [
  { state: 'overdue', title: 'Muddati o‘tgan', hint: 'Birinchi navbatda eslatma yuboring', icon: 'alert', tone: 'bad' },
  { state: 'due_soon', title: 'Yaqin', hint: '7 kun ichida muddati keladi', icon: 'clock', tone: 'warn' },
  { state: 'on_track', title: 'Muddatida', hint: 'Muddatigacha 7 kundan ko‘p', icon: 'check', tone: 'ok' },
  { state: 'no_date', title: 'Muddatsiz', hint: 'Qaytarish kuni belgilanmagan', icon: 'history', tone: 'mut' },
];

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
  const noDate = rows.filter((r) => r.info.state === 'no_date');
  const overdueSum = overdue.reduce((a, r) => a + r.sale.remainingAmount, 0);
  const dueSoonSum = dueSoon.reduce((a, r) => a + r.sale.remainingAmount, 0);

  // Filtr
  const f = sp.f;
  const filtered = rows.filter((r) => {
    if (f === 'overdue') return r.info.state === 'overdue';
    if (f === 'due_soon') return r.info.state === 'due_soon';
    if (f === 'no_date') return r.info.state === 'no_date';
    return true;
  });

  // Guruh ichida: eng ko'p kechikkan / eng yaqin muddat birinchi
  filtered.sort((a, b) => (a.info.daysLeft ?? 1e9) - (b.info.daysLeft ?? 1e9));
  const groups = GROUPS.map((g) => {
    const list = filtered.filter((r) => r.info.state === g.state);
    return { ...g, list, sum: list.reduce((a, r) => a + r.sale.remainingAmount, 0) };
  }).filter((g) => g.list.length > 0);

  const CHIPS = [
    { key: undefined, label: 'Barchasi', count: rows.length },
    { key: 'overdue', label: 'Muddati o‘tgan', count: overdue.length },
    { key: 'due_soon', label: 'Yaqin', count: dueSoon.length },
    { key: 'no_date', label: 'Muddatsiz', count: noDate.length },
  ];
  const isKnown = ['overdue', 'due_soon', 'no_date'].includes(f ?? '');

  return (
    <div className="cl-page">
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">Qarzdorlik nazorati</h1>
          <p className="t-page-sub">Muddati o&apos;tgan va yaqinlashayotgan to&apos;lovlarni kuzating</p>
        </div>
        <div className="t-page-actions">
          <Link href="/app/sales/new" className="btn btn-primary btn-with-icon"><Icon name="plus" size={16} /> Yangi sotuv</Link>
        </div>
      </div>

      <section className="cl-bento" aria-label="Qarzdorlik xulosasi">
        <div className="cl-stat cl-stat--hero">
          <span className="cl-stat-l"><Icon name="wallet" size={15} /> Jami qarzdorlik</span>
          <span className="cl-stat-v t-num">{fmtMoney(totalDebt)} <small>so&apos;m</small></span>
          <span className="cl-stat-s">{rows.length} ta qarzdor sotuv</span>
        </div>
        <Link href="/app/debts?f=overdue" className="cl-stat cl-stat--bad">
          <span className="cl-stat-l"><Icon name="alert" size={15} /> Muddati o&apos;tgan</span>
          <span className="cl-stat-v t-num">{fmtMoney(overdueSum)}</span>
          <span className="cl-stat-s">{overdue.length} ta mijoz</span>
        </Link>
        <Link href="/app/debts?f=due_soon" className="cl-stat cl-stat--warn">
          <span className="cl-stat-l"><Icon name="clock" size={15} /> Muddati yaqin (≤7 kun)</span>
          <span className="cl-stat-v t-num">{fmtMoney(dueSoonSum)}</span>
          <span className="cl-stat-s">{dueSoon.length} ta mijoz</span>
        </Link>
        <Link href="/app/debts?f=no_date" className="cl-stat">
          <span className="cl-stat-l"><Icon name="history" size={15} /> Muddatsiz</span>
          <span className="cl-stat-v t-num">{noDate.length} ta</span>
          <span className="cl-stat-s">Muddat belgilang</span>
        </Link>
      </section>

      <nav className="cl-seg" aria-label="Holat bo'yicha filtr">
        {CHIPS.map((c) => {
          const active = c.key ? f === c.key : !isKnown;
          return (
            <Link key={c.label} href={c.key ? `/app/debts?f=${c.key}` : '/app/debts'} aria-current={active ? 'page' : undefined}>
              {c.label} <span className="t-num">{c.count}</span>
            </Link>
          );
        })}
      </nav>

      {groups.length === 0 ? (
        <div className="cl-card">
          <EmptyState
            icon="check"
            title="Qarzdor topilmadi"
            text={isKnown ? 'Bu holatda qarzdor sotuv yo‘q.' : 'Barcha qarzlar to‘langan — ajoyib!'}
            action={isKnown ? { href: '/app/debts', label: 'Barchasini ko‘rish' } : undefined}
          />
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.state} className={`cl-group cl-group--${g.state}`} aria-labelledby={`dg-${g.state}`}>
            <header className="cl-group-h">
              <span className={`cl-group-ic cl-group-ic--${g.tone}`} aria-hidden="true"><Icon name={g.icon} size={16} /></span>
              <div>
                <h2 id={`dg-${g.state}`}>{g.title} <span className="t-num">{g.list.length}</span></h2>
                <small>{g.hint}</small>
              </div>
              <b className="cl-group-sum t-num">{fmtMoney(g.sum)} so&apos;m</b>
            </header>
            <ul className="cl-card cl-debts">
              {g.list.map(({ sale: s, info }) => {
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
                  <li key={String(s._id)} className="cl-debt">
                    <Avatar name={s.customerSnapshot?.fullName} />
                    <div className="cl-debt-main">
                      <b className="cl-row-name">{name}</b>
                      <small className="cl-row-sub">
                        {phone ? <a href={`tel:${phone}`} className="t-num">{phone}</a> : 'Telefon yo‘q'}
                        {' · '}
                        <Link href={`/app/sales/${s._id}`} className="cell-link">{s.productSnapshot.name}</Link>
                      </small>
                    </div>
                    <div className="cl-debt-due">
                      <b className="cl-row-amt t-num">{fmtMoney(s.remainingAmount)} <small>so&apos;m</small></b>
                      <span className="cl-debt-date">
                        {s.dueDate && <span className="t-num">{fmtDate(s.dueDate)}</span>}
                        <Pill tone={g.tone}>{info.label}</Pill>
                      </span>
                    </div>
                    <div className="cl-debt-act">
                      <DebtReminderButton phone={phone} text={text} prominent={info.state === 'overdue' || info.state === 'due_soon'} />
                      <Link href={`/app/sales/${s._id}`} className="btn btn-ghost btn-sm btn-with-icon">
                        <Icon name="wallet" size={14} /> To&apos;lov
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
