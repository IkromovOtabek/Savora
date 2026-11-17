import { getTenantSession } from '@/lib/tenantSession';
import { userCan } from '@/lib/permissionGuard';
import { getDict } from '@/lib/i18n/server';
import KitchenScreen from '@/components/restaurant/kitchen/KitchenScreen';
import '@/components/restaurant/kitchen/kitchen.css';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.restaurant.kitchen.title };
}

const HEX24 = /^[a-f0-9]{24}$/i;
const idParam = (v: string | string[] | undefined) => (typeof v === 'string' && HEX24.test(v) ? v : '');

/**
 * Oshxona ekrani (KDS) — planshet/TV. Ma'lumot client'da polling bilan (GET /api/restaurant/kitchen),
 * shu sahifa faqat huquq va URL tanlovini beradi. `?station=` — stansiya, `?branch=` — filial (admin).
 */
export default async function KitchenPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await getTenantSession();
  const sp = await searchParams;
  const canBump = await userCan(user, 'kitchen.bump');
  return (
    <KitchenScreen
      canBump={canBump}
      isAdmin={user.role === 'admin'}
      urlStation={idParam(sp.station)}
      urlBranch={user.role === 'admin' ? idParam(sp.branch) : ''}
    />
  );
}
