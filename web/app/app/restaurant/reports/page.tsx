import Link from 'next/link';
import Form from 'next/form';
import { requireFeature } from '@/lib/auth';
import { requirePermission } from '@/lib/permissionGuard';
import { restaurantCtxFromSession } from '@/lib/restaurant/session';
import { REPORT_CSV_SECTIONS, REPORT_LIMITS, REPORT_MAX_DAYS, parseReportRange, restaurantReport, type ReportRange } from '@/lib/restaurant/reports';
import { getI18n } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import { fmtDate, fmtMoney } from '@/lib/format';
import { toDayKey } from '@/lib/period';
import DashFilter from '@/components/tenant/DashFilter';
import MoreMenu from '@/components/ui/MoreMenu';
import Icon from '@/components/icons/Icon';
import KitchenSection from '@/components/restaurant/reports/KitchenSection';
import StaffSection from '@/components/restaurant/reports/StaffSection';
import VoidsSection from '@/components/restaurant/reports/VoidsSection';
import SalesSection from '@/components/restaurant/reports/SalesSection';
import { durFmt } from '@/components/restaurant/reports/ui';
import '@/components/tenant/styles/finance.css';
import '@/components/tenant/styles/reports.css';
import '@/components/restaurant/reports/reports.css';

export async function generateMetadata() {
  const { d } = await getI18n();
  return { title: d.restaurant.reports.title };
}

const BASE = '/app/restaurant/reports';
const PRESETS = ['today', 'yesterday', 'week', 'month'] as const;
type SP = { p?: string; from?: string; to?: string; b?: string };

/** Filtr havolasi: davr (sukut — bugun) + filial; oraliq — from/to */
function query(range: Pick<ReportRange, 'period' | 'fromDay' | 'toDay'>, b: string, extra?: Record<string, string>): string {
  const q = new URLSearchParams(extra);
  if (range.period === 'range') { q.set('from', range.fromDay); q.set('to', range.toDay); }
  else if (range.period !== 'today') q.set('p', range.period);
  if (b) q.set('b', b);
  return q.toString();
}

/**
 * Restoran hisobotlari (modul `tables`, huquq `reports.view`): oshxona vaqtlari, ofitsant KPI, bekor qilinganlar, savdo.
 * Filtr — URL'da (?p= | ?from=&to=, ?b= — egasi uchun filial); ma'lumot — lib/restaurant/reports.ts.
 */
export default async function RestaurantReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireFeature('tables');
  await requirePermission('reports.view');
  const sp = await searchParams;
  const ctx = await restaurantCtxFromSession();
  const { d } = await getI18n();
  const t = d.restaurant.reports;
  const dp = d.shell.dash.period;
  const dur = durFmt(d);

  const range = parseReportRange(sp);
  const isAdmin = ctx.user.role === 'admin';
  const branchSel = isAdmin && sp.b && /^[a-f0-9]{24}$/i.test(sp.b) ? sp.b : '';
  const res = await restaurantReport(ctx, { from: range.from, to: range.to, branchId: branchSel || null });
  const canExport = ctx.perms.has('export.data');

  const periodText = range.period === 'range'
    ? (range.fromDay === range.toDay ? fmtDate(range.from) : `${fmtDate(range.from)} – ${fmtDate(new Date(range.to.getTime() - 1))}`)
    : dp[range.period];
  const branches = res.ok ? res.data.branches : [];
  const branchName = branchSel ? branches.find((b) => b.id === branchSel)?.name : '';
  const scopeText = isAdmin ? (branchName || t.allBranches) : '';
  const filterActive = range.period !== 'today' || branchSel !== '';
  const today = toDayKey(new Date());

  const head = (
    <>
      <div>
        <h1 className="t-page-title">{t.title}</h1>
        <p className="t-page-sub">{[periodText, scopeText].filter(Boolean).join(' · ')}</p>
      </div>
      {canExport && res.ok && (
        <div className="rr-head-tools">
          <MoreMenu label={t.download}>
            {REPORT_CSV_SECTIONS.map((s) => (
              <a key={s} href={`/api/restaurant/reports/export?${query(range, '', { section: s, ...(branchSel ? { branchId: branchSel } : {}) })}`} download>
                <Icon name="download" size={18} /> {t.csvLinks[s]}
              </a>
            ))}
          </MoreMenu>
        </div>
      )}
    </>
  );

  return (
    <div className="rr-page">
      <DashFilter head={head} active={filterActive} label={t.filter}>
        <div className="t-filter-row">
          <span className="t-filter-l">{t.filterPeriod}</span>
          <nav className="t-period-seg" aria-label={dp.aria}>
            {PRESETS.map((p) => {
              const qs = query({ period: p, fromDay: '', toDay: '' }, branchSel);
              return (
                <Link key={p} href={qs ? `${BASE}?${qs}` : BASE} scroll={false} aria-current={range.period === p ? 'page' : undefined}>{dp[p]}</Link>
              );
            })}
          </nav>
        </div>
        <div className="t-filter-row">
          <span className="t-filter-l">{t.range}</span>
          <Form action={BASE} scroll={false} className={`rr-range${range.period === 'range' ? ' is-on' : ''}`}>
            {branchSel && <input type="hidden" name="b" value={branchSel} />}
            <label>{t.rangeFrom}<input type="date" name="from" defaultValue={range.fromDay} max={today} required /></label>
            <label>{t.rangeTo}<input type="date" name="to" defaultValue={range.toDay} max={today} required /></label>
            <button type="submit" className="btn btn-tinted btn-sm">{t.rangeApply}</button>
          </Form>
        </div>
        {isAdmin && branches.length > 1 && (
          <div className="t-filter-row">
            <span className="t-filter-l">{t.filterBranch}</span>
            <nav className="t-period-seg" aria-label={t.filterBranch}>
              <Link href={`${BASE}${query(range, '') ? `?${query(range, '')}` : ''}`} scroll={false} aria-current={!branchSel ? 'page' : undefined}>{t.allBranches}</Link>
              {branches.map((b) => (
                <Link key={b.id} href={`${BASE}?${query(range, b.id)}`} scroll={false} aria-current={branchSel === b.id ? 'page' : undefined}>{b.name}</Link>
              ))}
            </nav>
          </div>
        )}
        {filterActive && <Link href={BASE} scroll={false} className="t-filter-reset">{t.filterReset}</Link>}
      </DashFilter>

      {range.clamped && <div className="t-note t-note--warn">{tr(t.rangeClamped, { n: REPORT_MAX_DAYS })}</div>}

      {!res.ok ? (
        <div className="t-note t-note--warn" role="alert">{res.error}</div>
      ) : (
        <>
          <section className="ux-strip rr-tiles" aria-label={t.title}>
            <div className="fn-tile">
              <span className="fn-tile-head"><span className="ux-clay ux-clay--green"><Icon name="wallet" size={15} /></span> {t.tiles.revenue}</span>
              <span className="fn-tile-v">{fmtMoney(res.data.sales.totals.revenue)}<small>{d.common.sum}</small></span>
              <span className="fn-tile-s">{tr(t.tiles.revenueSub, { n: res.data.sales.totals.orders })}</span>
            </div>
            <div className="fn-tile">
              <span className="fn-tile-head"><span className="ux-clay"><Icon name="cart" size={15} /></span> {t.tiles.avgCheck}</span>
              <span className="fn-tile-v">{fmtMoney(res.data.sales.totals.avgCheck)}<small>{d.common.sum}</small></span>
              <span className="fn-tile-s">{tr(t.tiles.avgCheckSub, { n: res.data.sales.totals.guests })}</span>
            </div>
            <div className="fn-tile">
              <span className="fn-tile-head"><span className="ux-clay ux-clay--gold"><Icon name="clock" size={15} /></span> {t.tiles.prep}</span>
              <span className="fn-tile-v">{dur(res.data.kitchen.prep.avgMs)}</span>
              <span className="fn-tile-s">{res.data.kitchen.prep.p90Ms != null ? tr(t.tiles.prepSub, { v: dur(res.data.kitchen.prep.p90Ms) }) : t.noData}</span>
            </div>
            <div className={`fn-tile${res.data.voids.totals.lossAmount > 0 ? ' rr-tile-loss' : ''}`}>
              <span className="fn-tile-head"><span className="ux-clay ux-clay--red"><Icon name="alert" size={15} /></span> {t.tiles.loss}</span>
              <span className="fn-tile-v">{fmtMoney(res.data.voids.totals.lossAmount)}<small>{d.common.sum}</small></span>
              <span className="fn-tile-s">{tr(t.tiles.lossSub, { n: res.data.voids.totals.lossCount })}</span>
            </div>
          </section>

          <nav className="rr-nav" aria-label={t.navAria}>
            <a href="#kitchen"><Icon name="clock" size={16} /> {t.nav.kitchen}</a>
            <a href="#staff"><Icon name="users" size={16} /> {t.nav.staff}</a>
            <a href="#voids">
              <Icon name="alert" size={16} /> {t.nav.voids}
              {res.data.voids.totals.lossCount > 0 && <span className="rr-nav-n">{res.data.voids.totals.lossCount}</span>}
            </a>
            <a href="#sales"><Icon name="chart" size={16} /> {t.nav.sales}</a>
          </nav>

          {res.data.sales.truncated && <div className="t-note t-note--warn">{tr(t.truncated, { n: REPORT_LIMITS.orders })}</div>}

          <KitchenSection k={res.data.kitchen} d={d} />
          <StaffSection s={res.data.sales} v={res.data.voids} d={d} />
          <VoidsSection v={res.data.voids} d={d} maxRows={REPORT_LIMITS.voids} />
          <SalesSection s={res.data.sales} d={d} />
        </>
      )}
    </div>
  );
}
