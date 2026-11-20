import { redirect } from 'next/navigation';
import { restaurantCtxFromSession } from '@/lib/restaurant/session';
import { waiterDay } from '@/lib/restaurant/waiterDay';
import WaiterDayView from '@/components/restaurant/waiter/WaiterDayView';
import { getDict } from '@/lib/i18n/server';
import '@/components/tenant/styles/finance.css';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.waiterDay.metaTitle };
}

/**
 * Ofitsant kabineti «Mening kunim» (modul `tables`, huquq `order.create`): faqat o'z hisoblari — davr `?p=today|week|month`.
 * Ma'lumot — lib/restaurant/waiterDay.ts (mobil: /api/mobile/restaurant/waiter-day bilan bir xil).
 */
export default async function WaiterDayPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const ctx = await restaurantCtxFromSession();
  if (!ctx.features.tables) redirect('/app/locked?m=tables');
  if (!ctx.perms.has('order.create')) redirect('/app/locked?p=order.create');
  const sp = await searchParams;
  const r = await waiterDay(ctx, { period: sp.p });
  if (!r.ok) {
    return (
      <div className="ux-empty rt-empty" role="alert">
        <b>{r.error}</b>
      </div>
    );
  }
  return <WaiterDayView data={r.data} d={ctx.d} />;
}
