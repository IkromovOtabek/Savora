import { settingsPageContext } from '@/lib/restaurant/settingsExtra';
import { restaurantSetupView } from '@/lib/restaurant/queries';
import BranchPicker from '@/components/restaurant/settings/BranchPicker';
import HallsTablesManager from '@/components/restaurant/settings/HallsTablesManager';

/** Restoran sozlamalari → Zal va stollar (admin — ?branch=<id>) */
export default async function RestaurantTablesPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const sp = await searchParams;
  const { ctx } = await settingsPageContext();
  const r = await restaurantSetupView(ctx, { branchId: sp.branch || undefined });
  if (!r.ok) return <p className="t-note t-note--warn" role="alert">{r.error}</p>;
  return (
    <>
      <BranchPicker branches={r.data.branches} value={r.data.branchId} />
      {/* Filial almashganda holat (tanlangan zal, formalar) yangidan boshlanadi */}
      <HallsTablesManager key={r.data.branchId} data={r.data} qrMenu={!!ctx.features.qrMenu} />
    </>
  );
}
