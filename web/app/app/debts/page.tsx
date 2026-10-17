import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { branchFilter } from '@/lib/branchScope';
import { fmtDate, fmtMoney } from '@/lib/format';
import { computeDebtInfo, buildReminderText, DebtState, type DebtInfo } from '@/lib/debts';
import DebtReminderButton from '@/components/tenant/DebtReminderButton';
import Icon, { type IconName } from '@/components/icons/Icon';
import { Avatar, EmptyState, Pill, type PillTone } from '@/components/tenant/ClientsUi';
import Tilt from '@/components/ui/Tilt';
import type { CSSProperties } from 'react';
import { getDict, type Dict } from '@/lib/i18n/server';
import { plural, tr } from '@/lib/i18n/fmt';
import '@/components/tenant/styles/clients.css';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.sales.debts.metaTitle };
}

/** Guruhlar — muhimlik tartibida (sarlavha/izoh: d.sales.debts.groups[state]) */
const GROUPS: { state: DebtState; icon: IconName; tone: PillTone }[] = [
  { state: 'overdue', icon: 'alert', tone: 'bad' },
  { state: 'due_soon', icon: 'clock', tone: 'warn' },
  { state: 'on_track', icon: 'check', tone: 'ok' },
  { state: 'no_date', icon: 'history', tone: 'mut' },
];

/** Qarz muddati yorlig'i joriy tilda (lib/debts dagi label o'rniga) */
function debtLabel(info: DebtInfo, d: Dict): string {
  const n = info.daysLeft;
  if (n === null) return d.sales.debtLabel.noDate;
  if (n < 0) return tr(plural(-n, d.sales.nDaysLate), { n: -n });
  if (n === 0) return d.sales.debtLabel.dueToday;
  return tr(plural(n, d.sales.nDaysLeft), { n });
}

export default async function DebtsPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const sp = await searchParams;
  const { user, Sale, org } = await getTenantSession();
  const d = await getDict();
  const k = d.sales.debts;
  const nCustomers = (n: number) => tr(plural(n, d.sales.nCustomers), { n });

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
    return { ...g, ...k.groups[g.state], list, sum: list.reduce((a, r) => a + r.sale.remainingAmount, 0) };
  }).filter((g) => g.list.length > 0);

  const CHIPS = [
    { key: undefined, label: d.common.all, count: rows.length },
    { key: 'overdue', label: k.groups.overdue.title, count: overdue.length },
    { key: 'due_soon', label: k.groups.due_soon.title, count: dueSoon.length },
    { key: 'no_date', label: k.groups.no_date.title, count: noDate.length },
  ];
  const isKnown = ['overdue', 'due_soon', 'no_date'].includes(f ?? '');

  return (
    <div className="cl-page">
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{k.title}</h1>
          <p className="t-page-sub">{k.sub}</p>
        </div>
      </div>

      <section className="cl-sum" aria-label={k.summaryAria}>
        <Tilt stack className="cl-port cl-port--debt">
          <span className="ux-clay ux-clay--gold cl-port-ic" aria-hidden="true"><Icon name="wallet" size={20} /></span>
          <div className="cl-port-txt">
            <span className="cl-port-l">{k.totalDebt}</span>
            <span className="cl-port-v t-num ux-z">{fmtMoney(totalDebt)} <small>{d.common.sum}</small></span>
            <span className="cl-port-s">{tr(k.nDebtSales, { n: rows.length })}</span>
          </div>
        </Tilt>
        <div className="ux-strip cl-kpis" style={{ '--ux-cols': 3 } as CSSProperties}>
          <Link href="/app/debts?f=overdue" className="ux-stat cl-kpi cl-kpi--bad" aria-current={f === 'overdue' ? 'page' : undefined}>
            <span className="ux-clay ux-clay--red" aria-hidden="true"><Icon name="alert" size={20} /></span>
            <span className="cl-kpi-t">
              <span className="ux-stat-l">{k.groups.overdue.title}</span>
              <span className="ux-stat-v t-num">{fmtMoney(overdueSum)}</span>
              <span className="ux-stat-s">{nCustomers(overdue.length)}</span>
            </span>
          </Link>
          <Link href="/app/debts?f=due_soon" className="ux-stat cl-kpi cl-kpi--gold" aria-current={f === 'due_soon' ? 'page' : undefined}>
            <span className="ux-clay ux-clay--gold" aria-hidden="true"><Icon name="clock" size={20} /></span>
            <span className="cl-kpi-t">
              <span className="ux-stat-l">{k.dueSoon7}</span>
              <span className="ux-stat-v t-num">{fmtMoney(dueSoonSum)}</span>
              <span className="ux-stat-s">{nCustomers(dueSoon.length)}</span>
            </span>
          </Link>
          <Link href="/app/debts?f=no_date" className="ux-stat cl-kpi" aria-current={f === 'no_date' ? 'page' : undefined}>
            <span className="ux-clay ux-clay--gray" aria-hidden="true"><Icon name="history" size={20} /></span>
            <span className="cl-kpi-t">
              <span className="ux-stat-l">{k.groups.no_date.title}</span>
              <span className="ux-stat-v t-num">{tr(d.common.nPcs, { n: noDate.length })}</span>
              <span className="ux-stat-s">{k.setDue}</span>
            </span>
          </Link>
        </div>
      </section>

      <div className="cl-filterbar ux-scrollx">
        <nav className="cl-seg" aria-label={d.sales.statusFilterAria}>
          {CHIPS.map((c) => {
            const active = c.key ? f === c.key : !isKnown;
            return (
              <Link key={c.label} href={c.key ? `/app/debts?f=${c.key}` : '/app/debts'} aria-current={active ? 'page' : undefined}>
                {c.label} <span className="t-num">{c.count}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {groups.length === 0 ? (
        <div className="cl-card">
          <EmptyState
            icon="check"
            title={k.emptyTitle}
            text={isKnown ? k.emptyFiltered : k.emptyAll}
            action={isKnown ? { href: '/app/debts', label: d.sales.viewAll } : undefined}
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
              <b className="cl-group-sum t-num">{fmtMoney(g.sum)} {d.common.sum}</b>
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
                  <li key={String(s._id)} className={`cl-debt cl-debt--${g.state}`}>
                    <Avatar name={s.customerSnapshot?.fullName} />
                    <div className="cl-debt-main">
                      <b className="cl-row-name">{name}</b>
                      <small className="cl-row-sub">
                        {phone ? <a href={`tel:${phone}`} className="t-num">{phone}</a> : d.sales.noPhone}
                        {' · '}
                        <Link href={`/app/sales/${s._id}`} className="cell-link">{s.productSnapshot.name}</Link>
                      </small>
                    </div>
                    <b className="cl-debt-amt cl-row-amt t-num">{fmtMoney(s.remainingAmount)} <small>{d.common.sum}</small></b>
                    <span className="cl-debt-date">
                      <Pill tone={g.tone}>{debtLabel(info, d)}</Pill>
                      {s.dueDate && <span className="t-num">{fmtDate(s.dueDate)}</span>}
                    </span>
                    <div className="cl-debt-act">
                      <DebtReminderButton phone={phone} text={text} prominent={info.state === 'overdue' || info.state === 'due_soon'} />
                      <Link href={`/app/sales/${s._id}`} className="btn btn-ghost btn-sm btn-with-icon" aria-label={tr(k.payAria, { name })}>
                        <Icon name="wallet" size={14} /> <span className="cl-debt-pay">{d.common.payment}</span>
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
