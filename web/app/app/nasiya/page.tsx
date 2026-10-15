import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { branchFilter } from '@/lib/branchScope';
import { fmtMoney, fmtDate } from '@/lib/format';
import { computeInstallmentPlan, INSTALLMENT_STATE_META } from '@/lib/installment';
import type { ISale } from '@/lib/models/tenant/Sale';
import Icon from '@/components/icons/Icon';
import type { CSSProperties } from 'react';
import ScrollIntoViewMobile from '@/components/tenant/ScrollIntoViewMobile';
import Tilt from '@/components/ui/Tilt';
import { Avatar, EmptyState, Pill, Progress, Ring, type PillTone } from '@/components/tenant/ClientsUi';
import '@/components/tenant/styles/clients.css';

export const metadata = { title: 'Nasiya — Savora' };

const DAY = 24 * 60 * 60 * 1000;

/** Kechikish bo'limlari: 1–30 / 31–60 / 61–90 / 90+ kun */
const BUCKETS = [
  { key: '1', label: '1–30 kun', min: 1, max: 30 },
  { key: '2', label: '31–60 kun', min: 31, max: 60 },
  { key: '3', label: '61–90 kun', min: 61, max: 90 },
  { key: '4', label: '90+ kun', min: 91, max: Infinity },
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
    { key: undefined, label: 'Hammasi', count: rows.length },
    { key: 'debt', label: 'Qarzdor', count: debtRows.length },
    { key: 'today', label: 'Bugun', count: todayRows.length },
    { key: 'paid', label: 'Tugatilgan', count: paidRows.length },
  ];

  return (
    <div className="cl-page">
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">Nasiya</h1>
          <p className="t-page-sub">Bo&apos;lib to&apos;lash savdolari · <strong>{rows.length} ta</strong> · {fmtMoney(sumTotal)} so&apos;m</p>
        </div>
        <div className="t-page-actions ux-hide-mobile">
          <Link href="/app/sales/new?payment=installment" className="btn btn-primary btn-with-icon"><Icon name="plus" size={16} /> Nasiya sotuv</Link>
        </div>
      </div>
      <Link href="/app/sales/new?payment=installment" className="ux-fab" aria-label="Yangi nasiya sotuv">
        <Icon name="plus" size={18} /> Nasiya
      </Link>

      {/* Portfel xulosasi: 3D asosiy karta + ixcham lenta */}
      <section className="cl-sum" aria-label="Nasiya portfeli">
        <Tilt stack className="cl-port">
          <Ring value={sumTotal > 0 ? sumPaidAll / sumTotal : 0} size={88} />
          <div className="cl-port-txt">
            <span className="cl-port-l">Jami qoldiq</span>
            <span className="cl-port-v t-num ux-z">{fmtMoney(sumDebtRemaining)} <small>so&apos;m</small></span>
            <span className="cl-port-s">
              {debtRows.length} ta faol shartnoma · undirilgan <span className="t-num">{fmtMoney(sumPaidAll)}</span> so&apos;m
            </span>
          </div>
        </Tilt>
        <div className="ux-strip cl-kpis" style={{ '--ux-cols': 3 } as CSSProperties}>
          <Link href={href({ f: 'today' })} className="ux-stat cl-kpi cl-kpi--gold" aria-current={f === 'today' ? 'page' : undefined}>
            <span className="ux-clay ux-clay--gold" aria-hidden="true"><Icon name="clock" size={20} /></span>
            <span className="cl-kpi-t">
              <span className="ux-stat-l">Bugun kutilmoqda</span>
              <span className="ux-stat-v t-num">{fmtMoney(sumToday)}</span>
              <span className="ux-stat-s">{todayRows.length} ta mijoz</span>
            </span>
          </Link>
          <Link href={href({ f: 'debt' })} className="ux-stat cl-kpi cl-kpi--bad" aria-current={f === 'debt' ? 'page' : undefined}>
            <span className="ux-clay ux-clay--red" aria-hidden="true"><Icon name="alert" size={20} /></span>
            <span className="cl-kpi-t">
              <span className="ux-stat-l">Kechikkan</span>
              <span className="ux-stat-v t-num">{fmtMoney(sumLate)}</span>
              <span className="ux-stat-s">{lateRows.length} ta mijoz</span>
            </span>
          </Link>
          <Link href={href({ f: 'paid' })} className="ux-stat cl-kpi cl-kpi--ok" aria-current={f === 'paid' ? 'page' : undefined}>
            <span className="ux-clay ux-clay--green" aria-hidden="true"><Icon name="check" size={20} /></span>
            <span className="cl-kpi-t">
              <span className="ux-stat-l">Tugatilgan</span>
              <span className="ux-stat-v t-num">{paidRows.length} ta</span>
              <span className="ux-stat-s t-num">{fmtMoney(sumPaidTotal)} so&apos;m</span>
            </span>
          </Link>
        </div>
      </section>

      {/* Holat segmenti va kechikish chiplari — bitta aylanuvchi qator (kesilmaydi) */}
      <div className="cl-filterbar ux-scrollx">
        <nav className="cl-seg" aria-label="Holat bo'yicha filtr">
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
          <div className="cl-chips" role="group" aria-label="Kechikish muddati">
            <span className="cl-chips-l">Kechikish:</span>
            {bucketStats.map((bk) => (
              <Link
                key={bk.key}
                href={href({ f, b: b === bk.key ? undefined : bk.key })}
                className={`cl-chip cl-chip--b${bk.key}${b === bk.key ? ' cl-chip--active' : ''}`}
                aria-pressed={b === bk.key}
              >
                {bk.label} <b className="t-num">{bk.count}</b>
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
                title="Nasiya savdosi topilmadi"
                text={f || b ? 'Tanlangan filtr bo‘yicha shartnoma yo‘q.' : 'Bo‘lib to‘lash sotuvi qilinganda shu yerda ko‘rinadi.'}
                action={f || b ? { href: '/app/nasiya', label: 'Filtrni tozalash' } : { href: '/app/sales/new?payment=installment', label: 'Nasiya sotuv' }}
              />
            </div>
          ) : (
            <ul className="cl-list" aria-label="Nasiya shartnomalari">
              {shown.map((r) => {
                const id = String(r.s._id);
                const st = statusOf(r);
                const name = r.s.customerSnapshot?.fullName || 'Mijozsiz';
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
                          <small className="cl-row-sub">{r.s.productSnapshot.name} · <span className="t-num">{r.monthsPaid}/{r.months}</span>-oy</small>
                          <Pill tone={st.tone}>{st.label}</Pill>
                        </span>
                        <Progress value={r.progress} tone={r.isPaid ? 'ok' : r.lateDays > 0 ? 'bad' : undefined} label={`${name}: to'langan ulush`} />
                        {!r.isPaid && r.next && (
                          <small className="cl-row-next t-num">Keyingi to&apos;lov: {fmtDate(r.next.dueDate)} · {fmtMoney(r.next.amount - r.next.paidAmount)} so&apos;m</small>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <aside className="cl-md-detail" aria-label="Shartnoma tafsilotlari">
          {selected ? (
            <NasiyaDetail r={selected} back={href({ f, b })} />
          ) : (
            <div className="cl-card cl-md-placeholder">
              <EmptyState icon="clipboard" title="Shartnomani tanlang" text="Chapdagi ro‘yxatdan mijozni tanlasangiz, to‘lov jadvali shu yerda ochiladi." />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function statusOf(r: Row): { tone: PillTone; label: string } {
  if (r.isPaid) return { tone: 'ok', label: 'Tugatilgan' };
  if (r.lateDays > 0) return { tone: 'bad', label: `${r.lateDays} kun kechikdi` };
  if (r.todaySum > 0) return { tone: 'warn', label: 'Bugun' };
  return { tone: 'brand', label: 'Faol' };
}

function NasiyaDetail({ r, back }: { r: Row; back: string }) {
  const s = r.s;
  const status = statusOf(r);
  const phone = s.customerSnapshot?.phone;
  return (
    <div className="cl-card cl-detail">
      <ScrollIntoViewMobile dep={String(s._id)} />
      <Link href={back} className="cl-detail-back btn btn-plain btn-with-icon" scroll={false}>
        <Icon name="arrowLeft" size={16} /> Ro&apos;yxat
      </Link>
      <div className="cl-detail-head">
        <div className="cl-detail-id">
          <span className="cl-eyebrow">Sotuv №{s.saleNo} · {fmtDate(s.createdAt!)}</span>
          <h2>{s.customerSnapshot?.fullName || 'Mijozsiz'}</h2>
          <span className="cl-detail-sub">
            {phone ? <a href={`tel:${phone}`} className="t-num">{phone}</a> : 'Telefon yo‘q'} · <Pill tone={status.tone}>{status.label}</Pill>
          </span>
        </div>
        <Link href={`/app/sales/${s._id}`} className="btn btn-primary btn-with-icon">
          <Icon name="wallet" size={16} /> To&apos;lov qabul qilish
        </Link>
      </div>

      <div className="cl-detail-sum">
        <Ring value={r.progress} size={104} tone={r.isPaid ? 'ok' : r.lateDays > 0 ? 'bad' : 'gold'} />
        <dl className="cl-kv">
          <div><dt>Sotilgan narx</dt><dd className="t-num">{fmtMoney(s.totalAmount)}</dd></div>
          <div><dt>To&apos;langan</dt><dd className="t-num cl-c-ok">{fmtMoney(s.paidAmount)}</dd></div>
          <div><dt>Qoldiq</dt><dd className={`t-num${s.remainingAmount > 0 ? ' cl-c-gold' : ' cl-c-ok'}`}>{fmtMoney(s.remainingAmount)}</dd></div>
          <div><dt>Boshlang&apos;ich</dt><dd className="t-num">{fmtMoney(r.down)}</dd></div>
          <div><dt>Oylik</dt><dd className="t-num">{fmtMoney(r.monthly)}</dd></div>
          <div><dt>Muddat</dt><dd className="t-num">{r.monthsPaid}/{r.months} oy</dd></div>
        </dl>
      </div>

      <div className="cl-detail-prod">
        <Icon name="box" size={16} />
        <span>{s.productSnapshot.name}</span>
        <code className="imei-code">{s.productSnapshot.imei}</code>
      </div>

      {r.plan && r.plan.schedule.length > 0 && (
        <div>
          <h3 className="cl-ghead">To&apos;lov jadvali</h3>
          <ol className="cl-sched">
            {r.plan.schedule.map((m) => {
              const meta = INSTALLMENT_STATE_META[m.state];
              return (
                <li key={m.month} className={`cl-sched-row cl-sched-row--${m.state}`}>
                  <span className="cl-sched-ic" aria-hidden="true">
                    <Icon name={m.state === 'paid' ? 'check' : m.state === 'overdue' ? 'alert' : 'clock'} size={15} />
                  </span>
                  <span className="cl-sched-t">
                    <b className="t-num">{fmtDate(m.dueDate)}</b>
                    <small>{m.month}-oy</small>
                  </span>
                  <span className="cl-sched-a t-num">
                    {fmtMoney(m.amount)}
                    {m.state === 'partial' && <small>{fmtMoney(m.paidAmount)} to&apos;langan</small>}
                  </span>
                  <Pill tone={PILL_TONE[m.state]}>{meta.label}</Pill>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <Link href={`/app/sales/${s._id}`} className="btn btn-ghost btn-full">Sotuvni to&apos;liq ochish</Link>
    </div>
  );
}
