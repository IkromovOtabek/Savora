import Link from 'next/link';
import Form from 'next/form';
import { productionCtxFromSession } from '@/lib/production/session';
import { productionMeta } from '@/lib/production/catalog';
import { listRecipes } from '@/lib/production/recipes';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import { fmtMoney } from '@/lib/format';
import Icon from '@/components/icons/Icon';
import ProductionTabs from '@/components/production/common/ProductionTabs';
import { qtyText } from '@/components/production/common/ui';

export async function generateMetadata() {
  return { title: (await getDict()).production.recipes.title };
}

const BASE = '/app/production/recipes';
const PAGE_SIZE = 30;
type ActiveKey = 'active' | 'archived' | 'all';
type SP = { a?: string; q?: string; page?: string };

function href(a: ActiveKey, q: string, page = 1): string {
  const s = new URLSearchParams();
  if (a !== 'active') s.set('a', a);
  if (q) s.set('q', q);
  if (page > 1) s.set('page', String(page));
  const qs = s.toString();
  return qs ? `${BASE}?${qs}` : BASE;
}

/** Texkartalar ro'yxati: holat (faol/arxiv/hammasi), qidiruv, sahifalash; «Yangi texkarta» — `recipe.manage` */
export default async function RecipesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await productionCtxFromSession();
  const d = ctx.d;
  const t = d.production.recipes;
  const units = d.stock.fields.units;

  const a: ActiveKey = sp.a === 'archived' || sp.a === 'all' ? sp.a : 'active';
  const q = (sp.q ?? '').trim().slice(0, 80);
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const [meta, res] = await Promise.all([
    productionMeta(ctx),
    listRecipes(ctx, { active: a === 'all' ? 'all' : a === 'active', q: q || undefined, page, limit: PAGE_SIZE }),
  ]);
  const canManage = meta.ok && meta.data.can.manageRecipes;
  const pages = res.ok ? Math.max(1, Math.ceil(res.data.total / res.data.limit)) : 1;

  return (
    <>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{t.title}</h1>
          <p className="t-page-sub">{t.sub}</p>
        </div>
        {canManage && (
          <div className="t-page-actions">
            <Link href={`${BASE}/new`} className="btn btn-primary btn-with-icon">
              <Icon name="plus" size={16} /> {t.add}
            </Link>
          </div>
        )}
      </div>

      <ProductionTabs current="recipes" d={d} />

      <div className="pr-toolbar">
        <nav className="pr-seg" aria-label={t.filtersAria}>
          {(['active', 'archived', 'all'] as const).map((k) => (
            <Link key={k} href={href(k, q)} scroll={false} aria-current={a === k ? 'page' : undefined}>{t.filters[k]}</Link>
          ))}
        </nav>
        <Form action={BASE} scroll={false} className="pr-search" role="search">
          {a !== 'active' && <input type="hidden" name="a" value={a} />}
          <input className="input" type="search" name="q" defaultValue={q} placeholder={t.searchPh} aria-label={t.searchPh} maxLength={80} />
          <button type="submit" className="btn btn-ghost btn-sm">{d.common.search}</button>
        </Form>
      </div>

      {!res.ok ? (
        <p className="t-note t-note--warn" role="alert">{res.error}</p>
      ) : res.data.items.length === 0 ? (
        <div className="pr-card">
          <p className="pr-empty">{q || a !== 'active' ? t.emptyFiltered : t.empty}</p>
          {canManage && !q && a === 'active' && (
            <Link href={`${BASE}/new`} className="btn btn-tinted btn-sm btn-with-icon" style={{ justifySelf: 'center' }}>
              <Icon name="plus" size={15} /> {t.add}
            </Link>
          )}
        </div>
      ) : (
        <section className="pr-card pr-card--flush" aria-label={t.title}>
          <ul className="pr-rows">
            {res.data.items.map((r) => (
              <li key={r.id}>
                <Link href={`${BASE}/${r.id}`} className={`pr-row${r.active ? '' : ' is-off'}`}>
                  <span className="pr-row-main">
                    <b>{r.name}</b>
                    <small>{r.outputName} · {r.outputCode}</small>
                  </span>
                  <span className="pr-row-col">
                    <span>{qtyText(r.outputQty, r.unit, units)}</span>
                    <small>{tr(t.itemsCount, { n: r.items.length })} · {tr(t.opsCount, { n: r.operations.length })}</small>
                  </span>
                  <span className="pr-row-col">
                    {r.laborPerUnit > 0 ? (
                      <small>{tr(t.laborLine, { sum: fmtMoney(r.laborPerUnit) })}</small>
                    ) : (
                      <small>—</small>
                    )}
                  </span>
                  <span className="pr-row-end">
                    <span className="t-pill pr-pill">{tr(t.versionShort, { v: r.version })}</span>
                    {!r.active && <span className="t-pill t-pill--warn">{t.archived}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav className="pr-pager" aria-label={d.production.orders.pagerAria}>
              <Link href={href(a, q, page - 1)} className={`btn btn-ghost btn-sm${page <= 1 ? ' is-disabled' : ''}`} aria-disabled={page <= 1 || undefined} tabIndex={page <= 1 ? -1 : undefined}>
                {d.common.prev}
              </Link>
              <span>{tr(d.production.orders.pageOf, { page, pages })}</span>
              <Link href={href(a, q, page + 1)} className={`btn btn-ghost btn-sm${page >= pages ? ' is-disabled' : ''}`} aria-disabled={page >= pages || undefined} tabIndex={page >= pages ? -1 : undefined}>
                {d.common.next}
              </Link>
            </nav>
          )}
        </section>
      )}
    </>
  );
}
