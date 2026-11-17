import { settingsPageContext } from '@/lib/restaurant/settingsExtra';
import { restaurantSetupView } from '@/lib/restaurant/queries';
import GeneralSettingsForm from '@/components/restaurant/settings/GeneralSettingsForm';

/** Restoran sozlamalari → Umumiy: xizmat haqi, qadoq, bekor qilish nazorati, KDS, brend */
export default async function RestaurantGeneralPage() {
  const { ctx, org } = await settingsPageContext();
  const r = await restaurantSetupView(ctx);
  if (!r.ok) return <p className="t-note t-note--warn" role="alert">{r.error}</p>;
  return (
    <GeneralSettingsForm
      initial={r.data.settings}
      shopName={org.name}
      kitchen={!!ctx.features.kitchen}
      qrMenu={!!ctx.features.qrMenu}
      qrBaseUrl={r.data.qrBaseUrl}
    />
  );
}
