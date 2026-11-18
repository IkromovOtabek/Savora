import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getListing } from '@/lib/ecom/catalog';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import { fmtMoney } from '@/lib/format';
import { fmtQty } from '@/lib/qty';
import Icon from '@/components/icons/Icon';
import Gallery from '@/components/market/Gallery';
import { BuyBox } from '@/components/market/AddToCart';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const l = await getListing(id);
  const d = await getDict();
  if (!l) return { title: d.ecom.market.metaTitle };
  return {
    title: `${l.name} — ${l.shopName} · Savora Market`,
    description: (l.description ?? '').slice(0, 160) || `${l.name}: ${fmtMoney(l.price)} ${d.common.sum}`,
    openGraph: l.image ? { images: [l.image] } : undefined,
  };
}

/** Mahsulot sahifasi: rasmlar, narx, do'kon, tavsif, savatga qo'shish */
export default async function MarketProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const l = await getListing(id);
  if (!l) notFound();
  const d = await getDict();
  const t = d.ecom.market;
  const units = d.stock.fields.units as Record<string, string>;
  const unit = l.unit ? units[l.unit] ?? l.unit : '';
  const pct = l.oldPrice && l.oldPrice > l.price ? Math.round((1 - l.price / l.oldPrice) * 100) : 0;

  return (
    <>
      <Link href="/market" className="mk-back"><Icon name="arrowLeft" size={16} /> {t.back}</Link>
      <div className="mk-pdp">
        <Gallery images={l.images} alt={l.name} />
        <div className="mk-info">
          <h1>{l.name}</h1>
          <div className="mk-price">
            <b>{l.priceFrom ? tr(t.priceFrom, { price: fmtMoney(l.price) }) : fmtMoney(l.price)} {d.common.sum}</b>
            {pct > 0 && <s>{fmtMoney(l.oldPrice!)}</s>}
            {pct > 0 && <span className="mk-sale" style={{ position: 'static' }}>−{pct}%</span>}
          </div>
          <span className="mk-stock">{tr(t.inStock, { qty: `${fmtQty(l.qty)}${unit ? ` ${unit}` : ''}` })}</span>
          <BuyBox card={l} />
          <p className="mk-note"><Icon name="wallet" size={16} /> {t.payNote}</p>
          <Link href={`/market/s/${l.shopSlug}`} className="mk-panel mk-shopline">
            <span className="mk-shopline-av" aria-hidden>{l.shopName.slice(0, 1).toUpperCase()}</span>
            <span><small>{t.shop}</small><b>{l.shopName}</b></span>
            <Icon name="chevron" size={16} />
          </Link>
          <section className="mk-panel" aria-label={t.description}>
            <b>{t.description}</b>
            <p className="mk-desc">{l.description || t.noDescription}</p>
          </section>
        </div>
      </div>
    </>
  );
}
