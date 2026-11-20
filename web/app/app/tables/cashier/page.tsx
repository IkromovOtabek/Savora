import { redirect } from 'next/navigation';
import { getTenantSession } from '@/lib/tenantSession';
import { restaurantCtxFromSession } from '@/lib/restaurant/session';
import { tablesBoard } from '@/lib/restaurant/queries';
import CashierScreen from '@/components/restaurant/cashier/CashierScreen';
import { getDict } from '@/lib/i18n/server';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.cashier.metaTitle };
}

/**
 * Kassir oynasi: to'lov navbati + tanlangan hisob (to'lov, pre-chek). Modul `tables`, huquq `sale.create`;
 * hisoblarni ko'rish — `order.create`/`order.viewAll` (barcha hisoblar — `order.viewAll`, kirish qoidasi serverda).
 * Kassa smenasi to'lovni to'xtatmaydi (POS bilan bir xil) — ochilmagan bo'lsa ogohlantirish va smena havolasi.
 */
export default async function CashierPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const [ctx, { org, features, CashShift }] = await Promise.all([restaurantCtxFromSession(), getTenantSession()]);
  if (!ctx.features.tables) redirect('/app/locked?m=tables');
  if (!ctx.perms.has('sale.create')) redirect('/app/locked?p=sale.create');
  if (!ctx.perms.has('order.create') && !ctx.perms.has('order.viewAll')) redirect('/app/locked?p=order.viewAll');

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
  // Ko'rilayotgan filialda ochiq kassa smenasi (kassa moduli o'chiq bo'lsa — talab yo'q)
  const shiftOpen = features.kassa ? !!(await CashShift.exists({ status: 'open', branchId: r.data.branchId })) : true;

  return (
    <CashierScreen
      key={r.data.branchId}
      initial={r.data}
      serverNow={Date.parse(r.data.serverTime)}
      noShift={!shiftOpen}
      canShift={ctx.perms.has('kassa.view')}
      canAck={ctx.perms.has('order.create') || ctx.perms.has('order.viewAll')}
      shopName={org.name}
    />
  );
}
