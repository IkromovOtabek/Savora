import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { branchFilter } from '@/lib/branchScope';
import { fmtMoney, fmtDate } from '@/lib/format';
import { computeInstallmentPlan } from '@/lib/installment';
import type { ISale } from '@/lib/models/tenant/Sale';
import Icon from '@/components/icons/Icon';
import type { CSSProperties } from 'react';
import ScrollIntoViewMobile from '@/components/tenant/ScrollIntoViewMobile';
import Tilt from '@/components/ui/Tilt';
import { Avatar, EmptyState, Pill, Progress, Ring, type PillTone } from '@/components/tenant/ClientsUi';
import { getDict, type Dict } from '@/lib/i18n/server';
import { plural, tr } from '@/lib/i18n/fmt';
import '@/components/tenant/styles/clients.css';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.sales.nasiya.metaTitle };
}

const DAY = 24 * 60 * 60 * 1000;

/** Kechikish bo'limlari: 1–30 / 31–60 / 61–90 / 90+ kun (yorliq: d.sales.nasiya.bucketDays) */
const BUCKETS = [
  { key: '1', range: '1–30', min: 1, max: 30 },
  { key: '2', range: '31–60', min: 31, max: 60 },
  { key: '3', range: '61–90', min: 61, max: 90 },
  { key: '4', range: '90+', min: 91, max: Infinity },
] as const;

const PILL_TONE: Record<string, PillTone> = {
  paid: 'ok',
  partial: 'brand',
  upcoming: 'mut',
  overdue: 'bad',
};

type SaleLike = ISale & { _id: { toString(): string } };

/** Sotuvdan ro'yxat qatori: jadval, kechikish kunlari, bugungi summa, progress */
function toRow(s: SaleLike, now: Date, today0: Date) {
  /** Bugungi kundan necha kun oldin (musbat = o'tib ketgan) */
  const daysAgo = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return Math.round((today0.getTime() - x.getTime()) / DAY);
  };
  const plan = computeInstallmentPlan(s, now);
  const isPaid = s.status === 'paid' || s.remainingAmount === 0;
  const unpaid = isPaid ? [] : (plan?.schedule ?? []).filter((m) => !m.paid);
  const late = unpaid.filter((m) => daysAgo(m.dueDate) > 0);
  const dueToday = unpaid.filter((m) => daysAgo(m.dueDate) === 0);
  const lateDays = late.length ? daysAgo(late[0].dueDate) : 0;
  return {
    s,
    plan,
    down: plan?.down ?? 0,
    monthly: plan?.monthly ?? 0,
    monthsPaid: plan?.monthsPaid ?? 0,
    months: s.installmentMonths ?? 0,
    isPaid,
    next: unpaid[0],
    lateDays,
    lateSum: late.reduce((a, m) => a + (m.amount - m.paidAmount), 0),
    todaySum: dueToday.reduce((a, m) => a + (m.amount - m.paidAmount), 0),
    bucket: lateDays > 0 ? BUCKETS.find((bk) => lateDays >= bk.min && lateDays <= bk.max)?.key : undefined,
    progress: s.totalAmount > 0 ? s.paidAmount / s.totalAmount : 0,
  };
}

type Row = ReturnType<typeof toRow>;

export default async function NasiyaPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; b?: string; id?: string }>;
}) {
  const sp = await searchParams;
  const { user, Sale } = await getTenantSession();
  const d = await getDict();
  const k = d.sales.nasiya;
  const nCustomers = (n: number) => tr(plural(n, d.sales.nCustomers), { n });
  const now = new Date();
  const today0 = new Date(now);
  today0.setHours(0, 0, 0, 0);

  // Faqat nasiya (bo'lib to'lash) sotuvlari — filial login faqat o'z filialini ko'radi
  const sales = await Sale.find({ ...branchFilter(user), paymentType: 'installment', status: { $ne: 'cancelled' } })
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  // Har sotuv uchun oy jadvali (boshlang'ich, oylik, to'langan oylar)
  const rows = sales.map((s) => toRow(s, now, today0));

  const paidRows = rows.filter((r) => r.isPaid);
  const debtRows = rows.filter((r) => !r.isPaid);
  const todayRows = debtRows.filter((r) => r.todaySum > 0);
  const lateRows = debtRows.filter((r) => r.lateDays > 0);
  const sumTotal = rows.reduce((a, r) => a + r.s.totalAmount, 0);
  const sumPaidAll = rows.reduce((a, r) => a + r.s.paidAmount, 0);
  const sumPaidTotal = paidRows.reduce((a, r) => a + r.s.totalAmount, 0);
  const sumDebtRemaining = debtRows.reduce((a, r) => a + r.s.remainingAmount, 0);
  const sumToday = todayRows.reduce((a, r) => a + r.todaySum, 0);
  const sumLate = lateRows.reduce((a, r) => a + r.lateSum, 0);
  const bucketStats = BUCKETS.map((bk) => {
    const list = lateRows.filter((r) => r.bucket === bk.key);
    return { ...bk, count: list.length, sum: list.reduce((a, r) => a + r.lateSum, 0) };
  });

  const f = sp.f; // '' | 'paid' (tugatilgan) | 'debt' (qarzdor) | 'today' (bugun to'lov)
  const b = BUCKETS.some((bk) => bk.key === sp.b) ? sp.b : undefined;
  let shown = f === 'paid' ? paidRows : f === 'debt' ? debtRows : f === 'today' ? todayRows : rows;
  if (b) shown = shown.filter((r) => r.bucket === b);

  const selected = sp.id ? rows.find((r) => String(r.s._id) === sp.id) : undefined;

  function href(p: { f?: string; b?: string; id?: string }) {
    const q = new URLSearchParams();
    if (p.f) q.set('f', p.f);
    if (p.b) q.set('b', p.b);
    if (p.id) q.set('id', p.id);
    const s = q.toString();
    return `/app/nasiya${s ? `?${s}` : ''}`;
  }

  const SEG = [
    { key: undefined, label: k.segAll, count: rows.length },
    { key: 'debt', label: k.segDebt, count: debtRows.length },
    { key: 'today', label: d.common.today, count: todayRows.length },
    { key: 'paid', label: k.finished, count: paidRows.length },
  ];

  return (
    <div className="cl-page">
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{k.title}</h1>
          <p className="t-page-sub">{k.sub} · <strong>{tr(d.common.nPcs, { n: rows.length })}</strong> · {fmtMoney(sumTotal)} {d.common.sum}</p>
        </div>
        <div className="t-page-actions ux-hide-mobile">
          <Link href="/app/sales/new?payment=installment" className="btn btn-primary btn-with-icon"><Icon name="plus" size={16} /> {k.nasiyaSale}</Link>
        </div>
      </div>
      <Link href="/app/sales/new?payment=installment" className="ux-fab" aria-label={k.newAria}>
        <Icon name="plus" size={18} /> {k.title}
      </Link>

      {/* Portfel xulosasi: 3D asosiy karta + ixcham lenta */}
      <section className="cl-sum" aria-label={k.portfolioAria}>
        <Tilt stack className="cl-port">
          <Ring value={sumTotal > 0 ? sumPaidAll / sumTotal : 0} size={88} />
          <div className="cl-port-txt">
            <span className="cl-port-l">{k.totalRemaining}</span>
            <span className="cl-port-v t-num ux-z">{fmtMoney(sumDebtRemaining)} <small>{d.common.sum}</small></span>
            <span className="cl-port-s">
              {tr(plural(debtRows.length, d.sales.nContracts), { n: debtRows.length })} · {k.collected} <span className="t-num">{fmtMoney(sumPaidAll)}</span> {d.common.sum}
            </span>
          </div>
        </Tilt>
        <div className="ux-strip cl-kpis" style={{ '--ux-cols': 3 } as CSSProperties}>
          <Link href={href({ f: 'today' })} className="ux-stat cl-kpi cl-kpi--gold" aria-current={f === 'today' ? 'page' : undefined}>
            <span className="ux-clay ux-clay--gold" aria-hidden="true"><Icon name="clock" size={20} /></span>
            <span className="cl-kpi-t">
              <span className="ux-stat-l">{k.expectedToday}</span>
              <span className="ux-stat-v t-num">{fmtMoney(sumToday)}</span>
              <span className="ux-stat-s">{nCustomers(todayRows.length)}</span>
            </span>
          </Link>
          <Link href={href({ f: 'debt' })} className="ux-stat cl-kpi cl-kpi--bad" aria-current={f === 'debt' ? 'page' : undefined}>
            <span className="ux-clay ux-clay--red" aria-hidden="true"><Icon name="alert" size={20} /></span>
            <span className="cl-kpi-t">
              <span className="ux-stat-l">{k.late}</span>
              <span className="ux-stat-v t-num">{fmtMoney(sumLate)}</span>
              <span className="ux-stat-s">{nCustomers(lateRows.length)}</span>
            </span>
          </Link>
          <Link href={href({ f: 'paid' })} className="ux-stat cl-kpi cl-kpi--ok" aria-current={f === 'paid' ? 'page' : undefined}>
            <span className="ux-clay ux-clay--green" aria-hidden="true"><Icon name="check" size={20} /></span>
            <span className="cl-kpi-t">
              <span className="ux-stat-l">{k.finished}</span>
              <span className="ux-stat-v t-num">{tr(d.common.nPcs, { n: paidRows.length })}</span>
              <span className="ux-stat-s t-num">{fmtMoney(sumPaidTotal)} {d.common.sum}</span>
            </span>
          </Link>
        </div>
      </section>

      {/* Holat segmenti va kechikish chiplari — bitta aylanuvchi qator (kesilmaydi) */}
      <div className="cl-filterbar ux-scrollx">
        <nav className="cl-seg" aria-label={d.sales.statusFilterAria}>
          {SEG.map((s) => {
            const active = (f ?? undefined) === s.key || (!s.key && !['paid', 'debt', 'today'].includes(f ?? ''));
            return (
              <Link key={s.label} href={href({ f: s.key, b })} aria-current={active ? 'page' : undefined}>
                {s.label} <span className="t-num">{s.count}</span>
              </Link>
            );
          })}
        </nav>
        {/* Kechikkan shartnoma bo'lmasa — nol chiplar shovqin qilmasin */}
        {(lateRows.length > 0 || b) && (
          <div className="cl-chips" role="group" aria-label={k.lateAria}>
            <span className="cl-chips-l">{k.lateLabel}</span>
            {bucketStats.map((bk) => (
              <Link
                key={bk.key}
                href={href({ f, b: b === bk.key ? undefined : bk.key })}
                className={`cl-chip cl-chip--b${bk.key}${b === bk.key ? ' cl-chip--active' : ''}`}
                aria-pressed={b === bk.key}
              >
                {tr(k.bucketDays, { range: bk.range })} <b className="t-num">{bk.count}</b>
                {bk.sum > 0 && <small className="t-num">{fmtMoney(bk.sum)}</small>}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className={`cl-md${selected ? ' cl-md--sel' : ''}`}>
        <div className="cl-md-list">
          {shown.length === 0 ? (
            <div className="cl-card">
              <EmptyState
                icon="clock"
                title={k.emptyTitle}
                text={f || b ? k.emptyFiltered : k.emptyNone}
                action={f || b ? { href: '/app/nasiya', label: d.sales.clearFilter } : { href: '/app/sales/new?payment=installment', label: k.nasiyaSale }}
              />
            </div>
          ) : (
            <ul className="cl-list" aria-label={k.contractsAria}>
              {shown.map((r) => {
                const id = String(r.s._id);
                const st = statusOf(r, d);
                const name = r.s.customerSnapshot?.fullName || k.noCustomer;
                return (
                  <li key={id}>
                    <Link
                      href={href({ f, b, id })}
                      className={`cl-row${r.lateDays > 0 ? ' cl-row--late' : r.isPaid ? ' cl-row--paid' : r.todaySum > 0 ? ' cl-row--today' : ''}`}
                      aria-current={selected && String(selected.s._id) === id ? 'true' : undefined}
                      scroll={false}
                    >
                      <Avatar name={r.s.customerSnapshot?.fullName} />
                      <span className="cl-row-body">
                        <span className="cl-row-top">
                          <b className="cl-row-name">{name}</b>
                          <b className="cl-row-amt t-num">{r.isPaid ? fmtMoney(r.s.totalAmount) : fmtMoney(r.s.remainingAmount)}</b>
                        </span>
                        <span className="cl-row-top">
                          <small className="cl-row-sub">{r.s.productSnapshot.name} · <span className="t-num">{tr(k.termVal, { paid: r.monthsPaid, total: r.months })}</span></small>
                          <Pill tone={st.tone}>{st.label}</Pill>
                        </span>
                        <Progress value={r.progress} tone={r.isPaid ? 'ok' : r.lateDays > 0 ? 'bad' : undefined} label={tr(k.paidShare, { name })} />
                        {!r.isPaid && r.next && (
                          <small className="cl-row-next t-num">{tr(k.nextPaymentLine, { date: fmtDate(r.next.dueDate), sum: fmtMoney(r.next.amount - r.next.paidAmount) })}</small>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <aside className="cl-md-detail" aria-label={k.detailAria}>
          {selected ? (
            <NasiyaDetail r={selected} back={href({ f, b })} d={d} />
          ) : (
            <div className="cl-card cl-md-placeholder">
              <EmptyState icon="clipboard" title={k.pickTitle} text={k.pickText} />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function statusOf(r: Row, d: Dict): { tone: PillTone; label: string } {
  if (r.isPaid) return { tone: 'ok', label: d.sales.nasiya.finished };
  if (r.lateDays > 0) return { tone: 'bad', label: tr(plural(r.lateDays, d.sales.nDaysLate), { n: r.lateDays }) };
  if (r.todaySum > 0) return { tone: 'warn', label: d.common.today };
  return { tone: 'brand', label: d.common.active };
}

function NasiyaDetail({ r, back, d }: { r: Row; back: string; d: Dict }) {
  const s = r.s;
  const k = d.sales.nasiya;
  const status = statusOf(r, d);
  const phone = s.customerSnapshot?.phone;
  return (
    <div className="cl-card cl-detail">
      <ScrollIntoViewMobile dep={String(s._id)} />
      <Link href={back} className="cl-detail-back btn btn-plain btn-with-icon" scroll={false}>
        <Icon name="arrowLeft" size={16} /> {k.list}
      </Link>
      <div className="cl-detail-head">
        <div className="cl-detail-id">
          <span className="cl-eyebrow">{tr(k.saleNo, { no: s.saleNo, date: fmtDate(s.createdAt!) })}</span>
          <h2>{s.customerSnapshot?.fullName || k.noCustomer}</h2>
          <span className="cl-detail-sub">
            {phone ? <a href={`tel:${phone}`} className="t-num">{phone}</a> : d.sales.noPhone} · <Pill tone={status.tone}>{status.label}</Pill>
          </span>
        </div>
        <Link href={`/app/sales/${s._id}`} className="btn btn-primary btn-with-icon">
          <Icon name="wallet" size={16} /> {d.sales.acceptPayment}
        </Link>
      </div>

      <div className="cl-detail-sum">
        <Ring value={r.progress} size={104} tone={r.isPaid ? 'ok' : r.lateDays > 0 ? 'bad' : 'gold'} />
        <dl className="cl-kv">
          <div><dt>{k.soldPrice}</dt><dd className="t-num">{fmtMoney(s.totalAmount)}</dd></div>
          <div><dt>{d.common.paid}</dt><dd className="t-num cl-c-ok">{fmtMoney(s.paidAmount)}</dd></div>
          <div><dt>{d.common.remaining}</dt><dd className={`t-num${s.remainingAmount > 0 ? ' cl-c-gold' : ' cl-c-ok'}`}>{fmtMoney(s.remainingAmount)}</dd></div>
          <div><dt>{d.sales.down}</dt><dd className="t-num">{fmtMoney(r.down)}</dd></div>
          <div><dt>{k.monthly}</dt><dd className="t-num">{fmtMoney(r.monthly)}</dd></div>
          <div><dt>{k.term}</dt><dd className="t-num">{tr(k.termVal, { paid: r.monthsPaid, total: r.months })}</dd></div>
        </dl>
      </div>

      <div className="cl-detail-prod">
        <Icon name="box" size={16} />
        <span>{s.productSnapshot.name}</span>
        <code className="imei-code">{s.productSnapshot.imei}</code>
      </div>

      {r.plan && r.plan.schedule.length > 0 && (
        <div>
          <h3 className="cl-ghead">{k.schedule}</h3>
          <ol className="cl-sched">
            {r.plan.schedule.map((m) => {
              return (
                <li key={m.month} className={`cl-sched-row cl-sched-row--${m.state}`}>
                  <span className="cl-sched-ic" aria-hidden="true">
                    <Icon name={m.state === 'paid' ? 'check' : m.state === 'overdue' ? 'alert' : 'clock'} size={15} />
                  </span>
                  <span className="cl-sched-t">
                    <b className="t-num">{fmtDate(m.dueDate)}</b>
                    <small>{tr(d.sales.monthN, { n: m.month })}</small>
                  </span>
                  <span className="cl-sched-a t-num">
                    {fmtMoney(m.amount)}
                    {m.state === 'partial' && <small>{tr(k.paidPart, { sum: fmtMoney(m.paidAmount) })}</small>}
                  </span>
                  <Pill tone={PILL_TONE[m.state]}>{d.sales.installmentState[m.state]}</Pill>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <Link href={`/app/sales/${s._id}`} className="btn btn-ghost btn-full">{k.openSale}</Link>
    </div>
  );
}
