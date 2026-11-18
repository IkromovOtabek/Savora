import { redirect } from 'next/navigation';
import { getBuyer } from '@/lib/ecom/buyerAuth';
import { buyerOrders } from '@/lib/ecom/orders';
import { getDict } from '@/lib/i18n/server';
import MyOrders from '@/components/market/MyOrders';
import { formatUzPhoneInput } from '@/lib/phone';

export async function generateMetadata() {
  return { title: `${(await getDict()).ecom.market.orders.title} · Savora Market`, robots: { index: false } };
}

export default async function MarketOrdersPage({ searchParams }: { searchParams: Promise<{ placed?: string }> }) {
  const buyer = await getBuyer();
  if (!buyer) redirect('/market/login?next=/market/orders');
  const sp = await searchParams;
  const [orders, d] = await Promise.all([buyerOrders(buyer.id), getDict()]);
  const t = d.ecom.market.orders;
  return (
    <>
      <div className="mk-hero"><div><h1>{t.title}</h1><p>{buyer.name} · {formatUzPhoneInput(buyer.phone)}</p></div></div>
      {sp.placed === '1' && <p className="mk-alert mk-alert--ok" style={{ maxWidth: 820 }}>{t.placed}</p>}
      {orders.length === 0 ? <div className="mk-empty">{t.empty}</div> : <MyOrders orders={orders} />}
    </>
  );
}
