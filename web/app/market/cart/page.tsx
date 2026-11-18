import { getBuyer } from '@/lib/ecom/buyerAuth';
import { getDict } from '@/lib/i18n/server';
import CartView from '@/components/market/CartView';

export async function generateMetadata() {
  return { title: `${(await getDict()).ecom.market.cart.title} · Savora Market`, robots: { index: false } };
}

/** Savat: tovarlar brauzerda; buyurtma — faqat kirgan xaridor */
export default async function MarketCartPage() {
  const [buyer, d] = await Promise.all([getBuyer(), getDict()]);
  return (
    <>
      <div className="mk-hero"><div><h1>{d.ecom.market.cart.title}</h1></div></div>
      <CartView buyer={buyer ? { name: buyer.name, phone: buyer.phone, address: buyer.address } : null} />
    </>
  );
}
