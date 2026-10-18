import StockAdjustPage from '@/components/tenant/StockAdjustPage';
import { getDict } from '@/lib/i18n/server';

export async function generateMetadata() {
  return { title: (await getDict()).stock.adjust.woMeta };
}

/** ?ids= — Ombor ro'yxatida belgilangan mahsulotlar hujjatga oldindan qo'shiladi */
export default async function WriteOffPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids } = await searchParams;
  return <StockAdjustPage mode="writeoff" initialIds={ids} />;
}
