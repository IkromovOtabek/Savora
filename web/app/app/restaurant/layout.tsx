import { requireFeature } from '@/lib/auth';
import { loadUserPermissions } from '@/lib/permissionGuard';
import { getDict } from '@/lib/i18n/server';
import RestaurantTabs from '@/components/restaurant/settings/RestaurantTabs';
import '@/components/restaurant/settings/settings.css';

export async function generateMetadata() {
  return { title: (await getDict()).restaurant.settings.title };
}

/**
 * Restoran sozlamalari (/app/restaurant/*): sarlavha + tablar. Modul — `tables`; sozlama sahifalari
 * o'zida `tables.manage` ni tekshiradi (settingsPageContext), hisobotlar tabi — `reports.view`.
 */
export default async function RestaurantLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireFeature('tables');
  const [perms, d] = await Promise.all([loadUserPermissions(user), getDict()]);
  const t = d.restaurant.settings;
  return (
    <>
      {/* Sarlavha (hisobotlar sahifasida — o'zining sarlavhasi) va tablar */}
      <RestaurantTabs title={t.title} sub={t.sub} canManage={perms.has('tables.manage')} canReports={perms.has('reports.view')} />
      {children}
    </>
  );
}
