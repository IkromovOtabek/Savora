import Link from 'next/link';
import { notFound } from 'next/navigation';
import { searchListings, shopInfo, parseSort } from '@/lib/ecom/catalog';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import Icon from '@/components/icons/Icon';
import ListingGrid from '@/components/market/ListingGrid';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await shopInfo(slug);
  return { title: s ? `${s.name} · Savora Market` : 'Savora Market' };
}

/** Do'kon sahifasi: xarid shartlari va do'konning barcha tovarlari */
export default async function MarketShopPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ sort?: string; page?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const shop = await shopInfo(slug);
  if (!shop) notFound();
  const d = await getDict();
  const t = d.ecom.market;
  const sort = parseSort(sp.sort);
  const page = Math.max(1, Number(sp.page) || 1);
  const res = await searchListings({ shop: shop.slug, sort, page });
  const link = (patch: { sort?: string; page?: number }) => {
    const p = new URLSearchParams();
    const s = patch.sort ?? sort;
    if (s !== 'new') p.set('sort', s);
    if (patch.page && patch.page > 1) p.set('page', String(patch.page));
    const q = p.toString();
    return `/market/s/${shop.slug}${q ? `?${q}` : ''}`;
  };

  return (
    <>
      <Link href="/market" className="mk-back"><Icon name="arrowLeft" size={16} /> {t.back}</Link>
      <div className="mk-hero">
        <div>
          <h1>{shop.name}</h1>
          <p>{tr(t.results, { n: shop.count })}</p>
        </div>
        <nav className="mk-sort" aria-label={t.sort.new}>
          {(['new', 'cheap', 'expensive'] as const).map((s) => (
            <Link key={s} href={link({ sort: s })} aria-current={sort === s ? 'page' : undefined}>{t.sort[s]}</Link>
          ))}
        </nav>
      </div>
      {shop.note && (
        <div className="mk-panel" style={{ marginBottom: 16 }}>
          <b>{t.shopTerms}</b>
          <p className="mk-desc">{shop.note}</p>
        </div>
      )}
      {res.items.length === 0 ? <div className="mk-empty">{t.empty}</div> : <ListingGrid items={res.items} d={d} showShop={false} />}
      {res.page < res.pages && (
        <div className="mk-more"><Link className="mk-btn mk-btn--ghost" href={link({ page: res.page + 1 })}>{t.loadMore}</Link></div>
      )}
    </>
  );
}
