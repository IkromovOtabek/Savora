import Link from 'next/link';
import { getTenantAdminSession } from '@/lib/tenantSession';
import { shopOrders } from '@/lib/ecom/orders';
import { getDict } from '@/lib/i18n/server';
import EcomOrdersBoard from '@/components/tenant/ecom/EcomOrdersBoard';

export async function generateMetadata() {
  return { title: (await getDict()).ecom.orders.metaTitle };
}

/** Onlayn buyurtmalar (Savora Market) — faol / yakunlangan */
export default async function EcomOrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab === 'done' ? 'done' : 'active';
  const { org } = await getTenantAdminSession();
  const d = await getDict();
  const k = d.ecom.orders;
  const orders = await shopOrders(String(org._id), tab);

  return (
    <div className="ec-page">
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{k.title}</h1>
          <p className="t-page-sub">{k.sub}</p>
        </div>
      </div>
      <nav className="ec-seg" aria-label={k.title}>
        <Link href="/app/ecom/orders" aria-current={tab === 'active' ? 'page' : undefined}>{k.tabActive}</Link>
        <Link href="/app/ecom/orders?tab=done" aria-current={tab === 'done' ? 'page' : undefined}>{k.tabDone}</Link>
      </nav>
      {orders.length === 0 ? (
        <div className="ec-card" style={{ padding: 32, textAlign: 'center' }}>
          <p className="ec-muted">{tab === 'active' ? k.empty : k.emptyDone}</p>
        </div>
      ) : (
        <EcomOrdersBoard orders={orders} />
      )}
    </div>
  );
}
