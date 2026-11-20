import { getTenantSession } from '@/lib/tenantSession';
import { getShopSettings } from '@/lib/shopSettings';
import { getDict } from '@/lib/i18n/server';
import PrintStation from '@/components/restaurant/print/PrintStation';
import '@/components/tenant/styles/sales.css';
import '@/components/restaurant/print/print.css';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.restaurant.print.title };
}

const HEX24 = /^[a-f0-9]{24}$/i;
const idParam = (v: string | string[] | undefined) => (typeof v === 'string' && HEX24.test(v) ? v : '');

/**
 * Printer stansiyasi (oshxona printeri) — kassa/oshxona kompyuterida Chrome `--kiosk-printing` bilan ochiq
 * turadi. Huquq va modul — ../layout.tsx (`kitchen` + `kitchen.view`). `?station=`, `?branch=` (admin).
 */
export default async function KitchenPrintPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ user, ShopSettings }, sp] = await Promise.all([getTenantSession(), searchParams]);
  const settings = await getShopSettings(ShopSettings);
  return (
    <PrintStation
      isAdmin={user.role === 'admin'}
      urlStation={idParam(sp.station)}
      urlBranch={user.role === 'admin' ? idParam(sp.branch) : ''}
      defaultWidth={settings.receipt.paperWidth === 58 ? 58 : 80}
    />
  );
}
