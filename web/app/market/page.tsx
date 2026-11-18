import Link from 'next/link';
import { searchListings, topCategories, parseSort, type CatalogSort } from '@/lib/ecom/catalog';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import ListingGrid from '@/components/market/ListingGrid';

type SP = { q?: string; c?: string; sort?: string; page?: string };

function qs(base: SP, patch: Partial<SP>): string {
  const p = new URLSearchParams();
  const v = { ...base, ...patch };
  if (v.q) p.set('q', v.q);
  if (v.c) p.set('c', v.c);
  if (v.sort && v.sort !== 'new') p.set('sort', v.sort);
  if (v.page && v.page !== '1') p.set('page', v.page);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Katalog: qidiruv, turkum, saralash, sahifalash (barcha do'konlar) */
export default async function MarketCatalogPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 60);
  const c = (sp.c ?? '').trim().slice(0, 80);
  const sort: CatalogSort = parseSort(sp.sort);
  const page = Math.max(1, Number(sp.page) || 1);
  const d = await getDict();
  const t = d.ecom.market;
  const [res, cats] = await Promise.all([
    searchListings({ q, category: c || undefined, sort, page }),
    topCategories(),
  ]);
  const base: SP = { q, c, sort };

  return (
    <>
      <div className="mk-hero">
        <div>
          <h1>{q ? `«${q}»` : d.ecom.brand}</h1>
          <p>{q || c ? tr(t.results, { n: res.total }) : t.tagline}</p>
        </div>
      </div>
      <div className="mk-filters">
        {cats.length > 0 && (
          <nav className="mk-chips" aria-label={t.all}>
            <Link className="mk-chip" href={`/market${qs(base, { c: '', page: '1' })}`} aria-current={!c ? 'page' : undefined}>{t.all}</Link>
            {cats.map((x) => (
              <Link key={x.name} className="mk-chip" href={`/market${qs(base, { c: x.name, page: '1' })}`} aria-current={c === x.name ? 'page' : undefined}>
                {x.name}
              </Link>
            ))}
          </nav>
        )}
        <nav className="mk-sort" aria-label={t.sort.new}>
          {(['new', 'cheap', 'expensive'] as const).map((s) => (
            <Link key={s} href={`/market${qs(base, { sort: s, page: '1' })}`} aria-current={sort === s ? 'page' : undefined}>{t.sort[s]}</Link>
          ))}
        </nav>
      </div>
      {res.items.length === 0 ? (
        <div className="mk-empty">{q || c ? t.emptySearch : t.empty}</div>
      ) : (
        <ListingGrid items={res.items} d={d} />
      )}
      {res.page < res.pages && (
        <div className="mk-more">
          <Link className="mk-btn mk-btn--ghost" href={`/market${qs(base, { page: String(res.page + 1) })}`}>{t.loadMore}</Link>
        </div>
      )}
    </>
  );
}
