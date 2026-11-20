import { redirect } from 'next/navigation';
import { restaurantCtxFromSession } from '@/lib/restaurant/session';
import { listReservations, reservationForm } from '@/lib/restaurant/reservations';
import { isDayKey } from '@/lib/restaurant/reservationRules';
import { getDict } from '@/lib/i18n/server';
import ReservationsBoard from '@/components/restaurant/reservations/ReservationsBoard';
import '@/components/restaurant/order/order.css';
import '@/components/restaurant/reservations/reservations.css';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.reservations.metaTitle };
}

/**
 * Bronlar (docs/RESTORAN_API.md §18): modul `tables`; ko'rish va «Keldi» — `order.create` yoki `reservation.manage`,
 * yaratish/tahrirlash/bekor/«Kelmadi» — `reservation.manage` (tekshiruv serverda — lib/restaurant/reservations.ts).
 * URL: ?d=YYYY-MM-DD (yo'q — bugun, Toshkent) &branch=<id> (egasi uchun).
 */
export default async function ReservationsPage({ searchParams }: { searchParams: Promise<{ d?: string; branch?: string }> }) {
  const ctx = await restaurantCtxFromSession();
  if (!ctx.features.tables) redirect('/app/locked?m=tables');
  if (!ctx.perms.has('order.create') && !ctx.perms.has('reservation.manage')) redirect('/app/locked?p=reservation.manage');

  const sp = await searchParams;
  const date = isDayKey(sp.d) ? sp.d : undefined;
  const branch = typeof sp.branch === 'string' && /^[a-f0-9]{24}$/i.test(sp.branch) ? sp.branch : undefined;
  let r = await listReservations(ctx, { date, branchId: branch });
  // Eskirgan/boshqa filial havolasi — standart filial
  if (!r.ok && branch) r = await listReservations(ctx, { date });
  if (!r.ok) {
    return (
      <div className="ux-empty rt-empty">
        <b>{r.error}</b>
      </div>
    );
  }
  const form = ctx.perms.has('reservation.manage') ? await reservationForm(ctx, { branchId: r.data.branchId }) : null;

  return <ReservationsBoard key={`${r.data.branchId}:${r.data.date}`} data={r.data} form={form?.ok ? form.data : null} />;
}
