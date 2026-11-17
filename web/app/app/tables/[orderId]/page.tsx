import { notFound, redirect } from 'next/navigation';
import { getTenantSession } from '@/lib/tenantSession';
import { restaurantCtxFromSession } from '@/lib/restaurant/session';
import { getOrder, staffMenu } from '@/lib/restaurant/queries';
import OrderScreen from '@/components/restaurant/order/OrderScreen';
import { getDict } from '@/lib/i18n/server';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.restaurant.order.metaTitle };
}

/** Buyurtma ekrani: menyu, savat, taomlar holati, pre-chek, to'lov. Keyin polling (OrderScreen) */
export default async function OrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const [ctx, { org }] = await Promise.all([restaurantCtxFromSession(), getTenantSession()]);
  if (!ctx.features.tables) redirect('/app/locked?m=tables');
  if (!ctx.perms.has('order.create') && !ctx.perms.has('order.viewAll')) redirect('/app/locked?p=order.create');

  const r = await getOrder(ctx, orderId);
  if (!r.ok) notFound();
  const order = r.data.order;
  const live = order.status === 'open' || order.status === 'precheck';
  const menu = live && ctx.perms.has('order.create') ? await staffMenu(ctx, { branchId: order.branchId }) : null;

  return (
    <OrderScreen
      key={order.id}
      initialOrder={order}
      initialMenu={menu && menu.ok ? menu.data : null}
      serverNow={Date.parse(r.data.serverTime)}
      shopName={org.name}
    />
  );
}
