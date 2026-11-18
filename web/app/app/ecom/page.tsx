import Link from 'next/link';
import { getTenantAdminSession } from '@/lib/tenantSession';
import { shopEcomGroups } from '@/lib/ecom/manage';
import { countNewShopOrders } from '@/lib/ecom/orders';
import { ecomDisplayName } from '@/lib/ecom/group';
import { resolvePublicFileUrl } from '@/lib/fileUrl';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import Icon from '@/components/icons/Icon';
import EcomManager, { type EcomRow } from '@/components/tenant/ecom/EcomManager';

export async function generateMetadata() {
  return { title: (await getDict()).ecom.panel.metaTitle };
}

const FILTERS = ['all', 'live', 'hidden', 'noPrice'] as const;
type Filter = (typeof FILTERS)[number];
const MAX_ROWS = 400;

/** Onlayn do'kon: qaysi tovarlar Savora Market'da ko'rinadi, ko'rsatish/yashirish, tahrir */
export default async function EcomPage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  const sp = await searchParams;
  const f: Filter = (FILTERS as readonly string[]).includes(sp.f ?? '') ? (sp.f as Filter) : 'all';
  const q = (sp.q ?? '').trim().slice(0, 60);
  const { org, Product, ShopSettings } = await getTenantAdminSession();
  const d = await getDict();
  const k = d.ecom.panel;
  const [{ groups, autoPublish }, newOrders] = await Promise.all([
    shopEcomGroups({ Product, ShopSettings }),
    countNewShopOrders(String(org._id)),
  ]);

  const count = { live: 0, hidden: 0, noPrice: 0 };
  for (const g of groups) count[g.state]++;
  const units = d.stock.fields.units as Record<string, string>;
  const needle = q.toLowerCase();
  const filtered = groups
    .filter((g) => f === 'all' || g.state === f)
    .filter((g) => !needle || ecomDisplayName(g).toLowerCase().includes(needle));
  const rows: EcomRow[] = filtered.slice(0, MAX_ROWS).map((g) => ({
    key: g.key,
    name: ecomDisplayName(g),
    image: g.images[0] ? resolvePublicFileUrl(g.images[0]) : undefined,
    price: g.price,
    maxPrice: g.maxPrice,
    qty: g.qty,
    unit: g.unit ? units[g.unit] ?? g.unit : undefined,
    state: g.state,
    listed: g.listed,
    manual: typeof g.explicit === 'boolean',
  }));
  const href = (nf: Filter) => {
    const p = new URLSearchParams();
    if (nf !== 'all') p.set('f', nf);
    if (q) p.set('q', q);
    const s = p.toString();
    return s ? `/app/ecom?${s}` : '/app/ecom';
  };

  return (
    <div className="ec-page">
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{k.title}</h1>
          <p className="t-page-sub">{k.sub}</p>
        </div>
        <div className="t-page-actions">
          <Link href="/app/ecom/orders" className="btn btn-ghost btn-with-icon">
            <Icon name="basket" size={16} /> {k.orders}{newOrders > 0 ? ` · ${tr(k.newOrders, { n: newOrders })}` : ''}
          </Link>
          <a href={`/market/s/${org.slug}`} target="_blank" rel="noopener" className="btn btn-primary btn-with-icon">
            <Icon name="globe" size={16} /> {k.openMarket}
          </a>
        </div>
      </div>

      <div className={`ec-mode${autoPublish ? '' : ' ec-mode--off'}`}>
        <span>{autoPublish ? k.modeAuto : k.modeManual}</span>
        <Link href="/app/settings?tab=ecom">{k.modeSettings}</Link>
      </div>

      <div className="ec-stats">
        <div className="ec-card ec-stat ec-stat--live"><b>{count.live}</b><span>{k.stat.live}</span></div>
        <div className="ec-card ec-stat"><b>{count.hidden}</b><span>{k.stat.hidden}</span></div>
        <div className="ec-card ec-stat ec-stat--bad"><b>{count.noPrice}</b><span>{k.stat.noPrice}</span></div>
      </div>

      <div className="ec-bar">
        <nav className="ec-seg" aria-label={k.title}>
          {FILTERS.map((x) => (
            <Link key={x} href={href(x)} aria-current={f === x ? 'page' : undefined}>
              {k.filter[x]}
              {x !== 'all' && <small>{count[x]}</small>}
            </Link>
          ))}
        </nav>
        <form method="get" className="ec-search" role="search">
          {f !== 'all' && <input type="hidden" name="f" value={f} />}
          <input name="q" type="search" defaultValue={q} placeholder={k.searchPh} aria-label={k.searchPh} autoComplete="off" />
          <button type="submit" className="btn btn-ghost">{d.common.search}</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <div className="ec-card ux-empty" style={{ padding: 32, textAlign: 'center' }}>
          <p className="ec-muted">{groups.length === 0 ? k.empty : k.emptyFilter}</p>
        </div>
      ) : (
        <EcomManager rows={rows} />
      )}
      {filtered.length > MAX_ROWS && <p className="ec-muted">{filtered.length - MAX_ROWS}+ …</p>}
    </div>
  );
}
