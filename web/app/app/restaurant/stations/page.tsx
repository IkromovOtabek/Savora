import { settingsPageContext } from '@/lib/restaurant/settingsExtra';
import { restaurantSetupView } from '@/lib/restaurant/queries';
import BranchPicker from '@/components/restaurant/settings/BranchPicker';
import StationsManager from '@/components/restaurant/settings/StationsManager';

/** Restoran sozlamalari → Stansiyalar (oshxona/bar; admin — ?branch=<id>) */
export default async function RestaurantStationsPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const sp = await searchParams;
  const { ctx } = await settingsPageContext();
  const r = await restaurantSetupView(ctx, { branchId: sp.branch || undefined });
  if (!r.ok) return <p className="t-note t-note--warn" role="alert">{r.error}</p>;
  return (
    <>
      <BranchPicker branches={r.data.branches} value={r.data.branchId} />
      {!ctx.features.kitchen && <p className="t-note t-note--info">{ctx.d.restaurant.settings.kitchenOff}</p>}
      <StationsManager key={r.data.branchId} stations={r.data.stations} branchId={r.data.branchId} />
    </>
  );
}
