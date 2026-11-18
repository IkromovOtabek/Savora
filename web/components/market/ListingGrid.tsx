import Link from 'next/link';
import Icon from '@/components/icons/Icon';
import type { ListingCard } from '@/lib/ecom/catalog';
import { fmtMoney } from '@/lib/format';
import { tr } from '@/lib/i18n/fmt';
import type { Dict } from '@/lib/i18n/dict';
import { CardAddButton } from './AddToCart';

/** Katalog to'ri (server komponent; savat tugmasi — client) */
export default function ListingGrid({ items, d, showShop = true }: { items: ListingCard[]; d: Dict; showShop?: boolean }) {
  const t = d.ecom.market;
  return (
    <ul className="mk-grid">
      {items.map((c) => {
        const pct = c.oldPrice && c.oldPrice > c.price ? Math.round((1 - c.price / c.oldPrice) * 100) : 0;
        return (
          <li key={c.id}>
            <article className="mk-card">
              <Link href={`/market/p/${c.id}`} className="mk-card-link">
                <div className="mk-card-img">
                  {c.image
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={c.image} alt={c.name} loading="lazy" />
                    : <Icon name="box" size={36} />}
                </div>
                {pct > 0 && <span className="mk-sale">−{pct}%</span>}
                <div className="mk-card-body">
                  <div className="mk-price">
                    <b>{c.priceFrom ? tr(t.priceFrom, { price: fmtMoney(c.price) }) : fmtMoney(c.price)} {d.common.sum}</b>
                    {pct > 0 && <s>{fmtMoney(c.oldPrice!)}</s>}
                  </div>
                  <span className="mk-card-name">{c.name}</span>
                  {showShop && <span className="mk-card-shop">{c.shopName}</span>}
                </div>
              </Link>
              <CardAddButton card={c} />
            </article>
          </li>
        );
      })}
    </ul>
  );
}
