import { redirect } from 'next/navigation';
import { restaurantCtxFromSession } from '@/lib/restaurant/session';
import { tablesBoard } from '@/lib/restaurant/queries';
import TablesBoard from '@/components/restaurant/order/TablesBoard';
import { getDict } from '@/lib/i18n/server';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.restaurant.tables.metaTitle };
}

/** Zal ko'rinishi: stollar, chaqiruvlar, saboy. Dastlabki taxta serverda, keyin polling (TablesBoard) */
export default async function TablesPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const ctx = await restaurantCtxFromSession();
  if (!ctx.features.tables) redirect('/app/locked?m=tables');
  if (!ctx.perms.has('order.create') && !ctx.perms.has('order.viewAll')) redirect('/app/locked?p=order.create');

  const sp = await searchParams;
  const branch = typeof sp.branch === 'string' && /^[a-f0-9]{24}$/i.test(sp.branch) ? sp.branch : undefined;
  let r = await tablesBoard(ctx, { branchId: branch });
  // Eskirgan/boshqa filial havolasi — standart filial
  if (!r.ok && branch) r = await tablesBoard(ctx);
  if (!r.ok) {
    return (
      <div className="ux-empty rt-empty">
        <b>{r.error}</b>
      </div>
    );
  }

  return (
    <TablesBoard
      key={r.data.branchId}
      initial={r.data}
      serverNow={Date.parse(r.data.serverTime)}
      canCreate={ctx.perms.has('order.create')}
      canAck={ctx.perms.has('order.create') || ctx.perms.has('order.viewAll')}
      canManage={ctx.perms.has('tables.manage')}
    />
  );
}
