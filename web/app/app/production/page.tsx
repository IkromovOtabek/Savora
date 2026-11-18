import Link from 'next/link';
import Form from 'next/form';
import { productionCtxFromSession } from '@/lib/production/session';
import { lowStockList, productionMeta } from '@/lib/production/catalog';
import { listOrders } from '@/lib/production/orders';
import { listRecipes } from '@/lib/production/recipes';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import { fmtDate, fmtMoney } from '@/lib/format';
import { isDayPeriod, periodRange, toDayKey } from '@/lib/period';
import DashFilter from '@/components/tenant/DashFilter';
import ProductionTabs from '@/components/production/common/ProductionTabs';
import StatusPill from '@/components/production/common/StatusPill';
import NewOrderButton from '@/components/production/orders/NewOrderButton';
import LowStockCard from '@/components/production/orders/LowStockCard';
import { isObjectId, qtyText } from '@/components/production/common/ui';

export async function generateMetadata() {
  return { title: (await getDict()).production.orders.title };
}

const BASE = '/app/production';
const PAGE_SIZE = 30;
const STATUSES = ['active', 'draft', 'in_progress', 'done', 'cancelled'] as const;
const PERIODS = ['all', 'today', 'week', 'month'] as const;
type Status = (typeof STATUSES)[number] | '';
type Period = (typeof PERIODS)[number] | 'range';
type SP = { s?: string; p?: string; from?: string; to?: string; b?: string; q?: string; page?: string };
type Filter = { s: Status; p: Period; from: string; to: string; b: string; q: string };

function href(f: Filter, over: Partial<Filter> & { page?: number } = {}): string {
  const x = { ...f, ...over };
  const s = new URLSearchParams();
  if (x.s) s.set('s', x.s);
  if (x.p === 'range') {
    if (x.from) s.set('from', x.from);
    if (x.to) s.set('to', x.to);
  } else if (x.p !== 'all') s.set('p', x.p);
  if (x.b) s.set('b', x.b);
  if (x.q) s.set('q', x.q);
  if (over.page && over.page > 1) s.set('page', String(over.page));
  const qs = s.toString();
  return qs ? `${BASE}?${qs}` : BASE;
}

/** Kun (YYYY-MM-DD) → mahalliy kun boshi / oxiri */
const dayStart = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const dayEnd = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 23, 59, 59, 999); };

/**
 * Ishlab chiqarish aktlari: holat, davr, ombor (admin) va qidiruv filtri (URL'da), sahifalash; «Yangi akt»
 * (`production.manage`); minimal qoldiqdan kam xom ashyo bloki.
 */
export default async function ProductionOrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await productionCtxFromSession();
  const d = ctx.d;
  const t = d.production.orders;
  const dp = d.shell.dash.period;
  const units = d.stock.fields.units;

  const meta = await productionMeta(ctx);
  if (!meta.ok) return <p className="t-note t-note--warn" role="alert">{meta.error}</p>;
  const m = meta.data;
  const multi = m.branches.length > 1;

  // Filtr (URL)
  const f: Filter = {
    s: (STATUSES as readonly string[]).includes(sp.s ?? '') ? (sp.s as Status) : '',
    p: isDayPeriod(sp.from) || isDayPeriod(sp.to) ? 'range' : (PERIODS as readonly string[]).includes(sp.p ?? '') ? (sp.p as Period) : 'all',
    from: isDayPeriod(sp.from) ? sp.from : '',
    to: isDayPeriod(sp.to) ? sp.to : '',
    b: multi && isObjectId(sp.b) && m.branches.some((b) => b.id === sp.b) ? sp.b : '',
    q: (sp.q ?? '').trim().slice(0, 80),
  };
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  let from: Date | undefined;
  let to: Date | undefined;
  if (f.p === 'range') {
    from = f.from ? dayStart(f.from) : undefined;
    to = f.to ? dayEnd(f.to) : undefined;
  } else if (f.p !== 'all') {
    const r = periodRange(f.p);
    from = r.start;
    to = new Date(r.end.getTime() - 1);
  }

  const [list, recipes, low] = await Promise.all([
    listOrders(ctx, { status: f.s || undefined, branchId: f.b || undefined, from, to, q: f.q || undefined, page, limit: PAGE_SIZE }),
    m.can.manageProduction ? listRecipes(ctx, { active: true, limit: 200 }) : Promise.resolve(null),
    lowStockList(ctx, { branchId: f.b || undefined }),
  ]);
  // Huquq yo'q (products.view / receipt.create / po.manage) — blok ko'rinmaydi
  const lowItems = low.ok ? low.data.items : [];
  const recipeChoices = recipes?.ok
    ? recipes.data.items.map((r) => ({ id: r.id, name: r.name, outputName: r.outputName, outputQty: r.outputQty, unit: r.unit }))
    : [];
  const filterActive = f.s !== '' || f.p !== 'all' || f.b !== '' || f.q !== '';
  const pages = list.ok ? Math.max(1, Math.ceil(list.data.total / list.data.limit)) : 1;
  const today = toDayKey(new Date());
  const statusLabel = (s: Exclude<Status, ''>) => (s === 'active' ? t.statusActive : d.production.common.orderStatuses[s]);

  const head = (
    <>
      <div>
        <h1 className="t-page-title">{t.title}</h1>
        <p className="t-page-sub">{t.sub}</p>
      </div>
      {m.can.manageProduction && (
        <div className="t-page-actions">
          <NewOrderButton recipes={recipeChoices} branches={m.branches} defaultBranchId={m.defaultBranchId} scoped={ctx.user.role !== 'admin'} />
        </div>
      )}
    </>
  );

  return (
    <>
      <DashFilter head={head} active={filterActive} label={t.filter}>
        <div className="t-filter-row">
          <span className="t-filter-l">{t.filterStatus}</span>
          <nav className="pr-seg" aria-label={t.filterStatus}>
            <Link href={href(f, { s: '' })} scroll={false} aria-current={f.s === '' ? 'page' : undefined}>{t.statusAll}</Link>
            {STATUSES.map((s) => (
              <Link key={s} href={href(f, { s })} scroll={false} aria-current={f.s === s ? 'page' : undefined}>{statusLabel(s)}</Link>
            ))}
          </nav>
        </div>
        <div className="t-filter-row">
          <span className="t-filter-l">{t.filterPeriod}</span>
          <nav className="pr-seg" aria-label={t.filterPeriod}>
            {PERIODS.map((p) => (
              <Link key={p} href={href(f, { p, from: '', to: '' })} scroll={false} aria-current={f.p === p ? 'page' : undefined}>{dp[p]}</Link>
            ))}
          </nav>
        </div>
        <div className="t-filter-row">
          <span className="t-filter-l">{t.filterRange}</span>
          <Form action={BASE} scroll={false} className={`pr-range${f.p === 'range' ? ' is-on' : ''}`}>
            {f.s && <input type="hidden" name="s" value={f.s} />}
            {f.b && <input type="hidden" name="b" value={f.b} />}
            {f.q && <input type="hidden" name="q" value={f.q} />}
            <label>{t.from}<input type="date" name="from" defaultValue={f.from} max={today} /></label>
            <label>{t.to}<input type="date" name="to" defaultValue={f.to} max={today} /></label>
            <button type="submit" className="btn btn-tinted btn-sm">{t.apply}</button>
          </Form>
        </div>
        {multi && (
          <div className="t-filter-row">
            <span className="t-filter-l">{t.filterBranch}</span>
            <nav className="pr-seg" aria-label={t.filterBranch}>
              <Link href={href(f, { b: '' })} scroll={false} aria-current={!f.b ? 'page' : undefined}>{t.allBranches}</Link>
              {m.branches.map((b) => (
                <Link key={b.id} href={href(f, { b: b.id })} scroll={false} aria-current={f.b === b.id ? 'page' : undefined}>{b.name}</Link>
              ))}
            </nav>
          </div>
        )}
        {filterActive && <Link href={BASE} scroll={false} className="t-filter-reset">{t.filterReset}</Link>}
      </DashFilter>

      <ProductionTabs current="orders" d={d} />

      <div className={lowItems.length ? 'pr-split' : 'pr-stack'}>
        <div className="pr-stack">
          <Form action={BASE} scroll={false} className="pr-search" role="search">
            {f.s && <input type="hidden" name="s" value={f.s} />}
            {f.p !== 'all' && f.p !== 'range' && <input type="hidden" name="p" value={f.p} />}
            {f.from && <input type="hidden" name="from" value={f.from} />}
            {f.to && <input type="hidden" name="to" value={f.to} />}
            {f.b && <input type="hidden" name="b" value={f.b} />}
            <input className="input" type="search" name="q" defaultValue={f.q} placeholder={t.searchPh} aria-label={t.searchPh} maxLength={80} />
            <button type="submit" className="btn btn-ghost btn-sm">{d.common.search}</button>
          </Form>

          {!list.ok ? (
            <p className="t-note t-note--warn" role="alert">{list.error}</p>
          ) : list.data.items.length === 0 ? (
            <div className="pr-card">
              <p className="pr-empty">{filterActive ? t.emptyFiltered : t.empty}</p>
            </div>
          ) : (
            <section className="pr-card pr-card--flush" aria-label={t.title}>
              <p className="pr-count pr-muted">{tr(t.totalCount, { n: list.data.total })}</p>
              <ul className="pr-rows">
                {list.data.items.map((o) => (
                  <li key={o.id}>
                    <Link href={`${BASE}/${o.id}`} className="pr-row">
                      <span className="pr-row-main">
                        <b>{o.outputName}</b>
                        <small>{o.docNo}{o.createdAt ? ` · ${fmtDate(o.createdAt)}` : ''}{o.recipeName !== o.outputName ? ` · ${o.recipeName}` : ''}</small>
                      </span>
                      <span className="pr-row-col">
                        <span>{tr(t.planShort, { qty: qtyText(o.plannedQty, o.unit, units) })}</span>
                        {o.producedQty !== null && (
                          <small>
                            {tr(t.doneShort, { qty: qtyText(o.producedQty, o.unit, units) })}
                            {o.scrapQty ? ` · ${tr(t.scrapShort, { qty: qtyText(o.scrapQty, o.unit, units) })}` : ''}
                          </small>
                        )}
                      </span>
                      <span className="pr-row-col">
                        {multi && (
                          <small>{o.fromBranchName ?? '—'}{o.toBranchName && o.toBranchName !== o.fromBranchName ? ` → ${o.toBranchName}` : ''}</small>
                        )}
                        {o.costTotal !== null && (
                          <span>
                            {fmtMoney(o.costTotal)} {d.common.sum}
                            {o.unitCost !== null && <small> · {tr(t.unitCostShort, { sum: fmtMoney(o.unitCost) })}</small>}
                          </span>
                        )}
                      </span>
                      <span className="pr-row-end">
                        <StatusPill status={o.status} d={d} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {pages > 1 && (
                <nav className="pr-pager" aria-label={t.pagerAria}>
                  <Link href={href(f, { page: page - 1 })} className={`btn btn-ghost btn-sm${page <= 1 ? ' is-disabled' : ''}`} aria-disabled={page <= 1 || undefined} tabIndex={page <= 1 ? -1 : undefined}>
                    {d.common.prev}
                  </Link>
                  <span>{tr(t.pageOf, { page, pages })}</span>
                  <Link href={href(f, { page: page + 1 })} className={`btn btn-ghost btn-sm${page >= pages ? ' is-disabled' : ''}`} aria-disabled={page >= pages || undefined} tabIndex={page >= pages ? -1 : undefined}>
                    {d.common.next}
                  </Link>
                </nav>
              )}
            </section>
          )}
        </div>

        {lowItems.length > 0 && (
          <aside className="pr-side" aria-label={d.production.lowStock.title}>
            <LowStockCard
              items={lowItems}
              branches={m.branches}
              d={d}
              canReceive={m.features.purchasing && m.can.receive}
              canPurchase={m.features.purchasing && m.can.managePo}
            />
          </aside>
        )}
      </div>
    </>
  );
}
