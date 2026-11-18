import Link from 'next/link';
import Form from 'next/form';
import { redirect } from 'next/navigation';
import { productionCtxFromSession } from '@/lib/production/session';
import { listPiecework, listWorkers, pieceworkSummary } from '@/lib/production/piecework';
import { productionMeta } from '@/lib/production/catalog';
import { PRODUCTION_LIMITS } from '@/lib/production/calc';
import { scoped } from '@/lib/production/context';
import { getI18n } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import { fmtDate, fmtMoney } from '@/lib/format';
import { toDayKey } from '@/lib/period';
import DashFilter from '@/components/tenant/DashFilter';
import MonthNav, { monthLabel } from '@/components/ui/MonthNav';
import Icon from '@/components/icons/Icon';
import { parsePwRange, pwHref, rangeParams } from '@/components/production/piecework/range';
import LogEntryButton from '@/components/production/piecework/LogEntryButton';
import EntriesTable from '@/components/production/piecework/EntriesTable';
import SummaryTable from '@/components/production/piecework/SummaryTable';

export async function generateMetadata() {
  const { d } = await getI18n();
  return { title: d.production.piecework.title };
}

const BASE = '/app/piecework';
const STATUSES = ['logged', 'approved', 'paid', 'rejected'] as const;
type SP = { m?: string; from?: string; to?: string; status?: string; w?: string; view?: string; page?: string };

/**
 * Ishbay (modul `piecework`): ishchi (`piecework.log`) — o'z yozuvlari, yangi yozuv, davr jamlamasi;
 * tasdiqlovchi (`piecework.approve`) — hammaning yozuvlari, ko'p tanlab tasdiqlash/rad etish, xodim bo'yicha
 * jamlama va «To'lash» (kassa chiqimi). Filtr URL'da: ?m=YYYY-MM | ?from=&to=, ?status=, ?w= (ishchi), ?view=summary.
 * Ma'lumot — lib/production/piecework.ts (docs/SEX_API.md §6.11–12).
 */
export default async function PieceworkPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await productionCtxFromSession();
  const { locale, d } = await getI18n();
  const t = d.production.piecework;
  const st = d.production.common.pieceworkStatuses;
  const canLog = ctx.perms.has('piecework.log');
  const canApprove = ctx.perms.has('piecework.approve');
  if (!canLog && !canApprove) redirect('/app/locked?p=piecework.log');

  const range = parsePwRange(sp);
  const view = sp.view === 'summary' ? 'summary' : 'entries';
  const status = (STATUSES as readonly string[]).includes(sp.status ?? '') ? sp.status! : '';
  const workerId = canApprove && sp.w && /^[a-f0-9]{24}$/i.test(sp.w) ? sp.w : '';
  const page = Math.max(1, Math.min(10_000, Number.parseInt(sp.page ?? '1', 10) || 1));

  const [summary, list, workersRes, meta] = await Promise.all([
    pieceworkSummary(ctx, { from: range.from, to: range.to, workerId: workerId || undefined }),
    view === 'entries'
      ? listPiecework(ctx, { status: status || undefined, workerId: workerId || undefined, from: range.from, to: range.to, page })
      : Promise.resolve(null),
    canApprove ? listWorkers(ctx) : Promise.resolve(null),
    canApprove ? productionMeta(ctx) : Promise.resolve(null),
  ]);
  const workers = workersRes?.ok ? workersRes.data.workers : [];
  const workerName = workerId ? (workers.find((w) => w.id === workerId)?.name ?? '') : '';

  // Havolalar: joriy filtr + o'zgarish
  const cur: Record<string, string | undefined> = {
    ...rangeParams(range),
    status: status || undefined,
    w: workerId || undefined,
    view: view === 'summary' ? 'summary' : undefined,
  };
  const href = (patch: Record<string, string | undefined> = {}) => pwHref(BASE, cur, { page: undefined, ...patch });

  const periodLabel = range.isRange
    ? (range.fromDay === range.toDay ? fmtDate(range.from) : `${fmtDate(range.from)} – ${fmtDate(range.to)}`)
    : monthLabel(range.month, locale);
  const filterActive = range.isRange || range.month !== range.currentMonth || !!status || !!workerId;
  const today = toDayKey(new Date());
  const totals = summary.ok ? summary.data.totals : null;
  const sumCell = (n: number) => <>{fmtMoney(n)}<small>{d.common.sum}</small></>;

  const head = (
    <>
      <div>
        <h1 className="t-page-title">{t.title}</h1>
        <p className="t-page-sub">{[periodLabel, workerName || (canApprove ? '' : t.subMine)].filter(Boolean).join(' · ')}</p>
      </div>
      {canLog && (
        <div className="t-page-actions pw-head-actions">
          <LogEntryButton canApprove={canApprove} selfName={ctx.user.username} workers={workers.map((w) => ({ id: w.id, name: w.name }))} />
        </div>
      )}
    </>
  );

  // Ishbay davrni oy bo'yicha yuritadi — oy navigatsiyasi saqlanadigan parametrlar bilan
  const monthHref = (ym: string) => pwHref(BASE, { ...cur, from: undefined, to: undefined, m: ym === range.currentMonth ? undefined : ym });

  return (
    <div className="pw-page">
      <DashFilter head={head} active={filterActive} label={t.filter}>
        <div className="t-filter-row">
          <span className="t-filter-l">{t.filterPeriod}</span>
          <MonthNav value={range.month} current={range.currentMonth} href={monthHref} />
        </div>
        <div className="t-filter-row">
          <span className="t-filter-l">{t.range}</span>
          <Form action={BASE} scroll={false} className={`pw-range${range.isRange ? ' is-on' : ''}`}>
            {status && <input type="hidden" name="status" value={status} />}
            {workerId && <input type="hidden" name="w" value={workerId} />}
            {view === 'summary' && <input type="hidden" name="view" value="summary" />}
            <label>{t.rangeFrom}<input type="date" name="from" defaultValue={range.fromDay} max={today} required /></label>
            <label>{t.rangeTo}<input type="date" name="to" defaultValue={range.toDay > today ? today : range.toDay} max={today} required /></label>
            <button type="submit" className="btn btn-tinted btn-sm">{t.rangeApply}</button>
          </Form>
        </div>
        {view === 'entries' && (
          <div className="t-filter-row">
            <span className="t-filter-l">{t.filterStatus}</span>
            <nav className="t-period-seg" aria-label={t.filterStatus}>
              <Link href={href({ status: undefined })} scroll={false} aria-current={!status ? 'page' : undefined}>{t.allStatuses}</Link>
              {STATUSES.map((s) => (
                <Link key={s} href={href({ status: s })} scroll={false} aria-current={status === s ? 'page' : undefined}>{st[s]}</Link>
              ))}
            </nav>
          </div>
        )}
        {canApprove && workers.length > 0 && (
          <div className="t-filter-row">
            <span className="t-filter-l">{t.filterWorker}</span>
            <Form action={BASE} scroll={false} className="pw-range">
              {Object.entries({ ...cur, w: undefined }).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
              <select name="w" defaultValue={workerId} className="pw-select" aria-label={t.filterWorker}>
                <option value="">{t.allWorkers}</option>
                {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <button type="submit" className="btn btn-tinted btn-sm">{t.rangeApply}</button>
            </Form>
          </div>
        )}
        {filterActive && <Link href={view === 'summary' ? `${BASE}?view=summary` : BASE} scroll={false} className="t-filter-reset">{t.filterReset}</Link>}
      </DashFilter>

      {range.clamped && <div className="t-note t-note--warn">{tr(t.rangeClamped, { n: PRODUCTION_LIMITS.maxPeriodDays })}</div>}

      {totals && (
        <section className="ux-strip pw-tiles" aria-label={t.summary}>
          <div className="fn-tile">
            <span className="fn-tile-head"><span className="ux-clay"><Icon name="wrench" size={15} /></span> {t.tiles.total}</span>
            <span className="fn-tile-v">{sumCell(totals.logged.amount + totals.approved.amount + totals.paid.amount)}</span>
            <span className="fn-tile-s">{tr(t.entriesN, { n: totals.logged.count + totals.approved.count + totals.paid.count })}</span>
          </div>
          <div className="fn-tile">
            <span className="fn-tile-head"><span className="ux-clay ux-clay--gold"><Icon name="clock" size={15} /></span> {t.tiles.logged}</span>
            <span className="fn-tile-v">{sumCell(totals.logged.amount)}</span>
            <span className="fn-tile-s">{tr(t.entriesN, { n: totals.logged.count })}</span>
          </div>
          <div className="fn-tile">
            <span className="fn-tile-head"><span className="ux-clay ux-clay--red"><Icon name="wallet" size={15} /></span> {t.tiles.approved}</span>
            <span className="fn-tile-v">{sumCell(totals.due)}</span>
            <span className="fn-tile-s">{tr(t.entriesN, { n: totals.approved.count })}</span>
          </div>
          <div className="fn-tile">
            <span className="fn-tile-head"><span className="ux-clay ux-clay--green"><Icon name="check" size={15} /></span> {t.tiles.paid}</span>
            <span className="fn-tile-v">{sumCell(totals.paid.amount)}</span>
            <span className="fn-tile-s">{tr(t.entriesN, { n: totals.paid.count })}</span>
          </div>
        </section>
      )}

      <div className="pw-tabs-row">
        <nav className="t-period-seg pw-tabs" aria-label={t.tabsAria}>
          <Link href={href({ view: undefined })} scroll={false} aria-current={view === 'entries' ? 'page' : undefined}>
            {canApprove ? t.tabEntries : t.myEntries}
          </Link>
          <Link href={href({ view: 'summary', status: undefined })} scroll={false} aria-current={view === 'summary' ? 'page' : undefined}>
            {t.tabSummary}
          </Link>
        </nav>
        {view === 'summary' && summary.ok && summary.data.workers.length > 0 && (
          <Link
            href={pwHref(`${BASE}/print`, { ...rangeParams(range), m: range.isRange ? undefined : range.month, w: workerId || undefined })}
            className="btn btn-ghost btn-sm btn-with-icon"
          >
            <Icon name="download" size={15} />{t.print}
          </Link>
        )}
      </div>

      {view === 'entries' && list && (
        !list.ok ? (
          <div className="t-note t-note--warn" role="alert">{list.error}</div>
        ) : list.data.items.length === 0 ? (
          <div className="fn-panel">
            <div className="ux-empty">
              <span className="ux-empty-ic"><Icon name="wrench" size={26} /></span>
              <b>{t.empty}</b>
              {canLog && <p>{t.sub}</p>}
            </div>
          </div>
        ) : (
          <section className="fn-panel pw-panel">
            <EntriesTable items={list.data.items} canApprove={canApprove} showWorker={canApprove && !workerId} />
            {list.data.total > list.data.limit && (
              <nav className="pw-pager">
                {page > 1
                  ? <Link href={href({ page: String(page - 1) })} className="btn btn-ghost btn-sm">{t.prev}</Link>
                  : <span />}
                <span className="pw-muted">{tr(t.pageOf, { page, pages: Math.ceil(list.data.total / list.data.limit) })}</span>
                {page * list.data.limit < list.data.total
                  ? <Link href={href({ page: String(page + 1) })} className="btn btn-ghost btn-sm">{t.next}</Link>
                  : <span />}
              </nav>
            )}
          </section>
        )
      )}

      {view === 'summary' && (
        !summary.ok ? (
          <div className="t-note t-note--warn" role="alert">{summary.error}</div>
        ) : summary.data.workers.length === 0 ? (
          <div className="fn-panel">
            <div className="ux-empty">
              <span className="ux-empty-ic"><Icon name="users" size={26} /></span>
              <b>{t.summaryEmpty}</b>
            </div>
          </div>
        ) : (
          <section className="fn-panel pw-panel" aria-label={t.summary}>
            <SummaryTable
              workers={summary.data.workers}
              canPay={canApprove}
              entriesBase={pwHref(BASE, rangeParams(range))}
              pay={{
                fromIso: range.from.toISOString(),
                toIso: range.to.toISOString(),
                periodLabel,
                branches: meta?.ok ? meta.data.branches.map((b) => ({ id: b.id, name: b.name })) : [],
                defaultBranchId: meta?.ok ? meta.data.defaultBranchId : null,
                scoped: scoped(ctx),
                workerBranch: Object.fromEntries(workers.map((w) => [w.id, w.branchId])),
              }}
            />
          </section>
        )
      )}
    </div>
  );
}
