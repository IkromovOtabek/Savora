import StockAdjustPage from '@/components/tenant/StockAdjustPage';
import { getDict } from '@/lib/i18n/server';

export async function generateMetadata() {
  return { title: (await getDict()).stock.adjust.revalMeta };
}

/** ?ids= — Ombor ro'yxatida belgilangan mahsulotlar hujjatga oldindan qo'shiladi */
export default async function RevaluationPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids } = await searchParams;
  return <StockAdjustPage mode="revaluation" initialIds={ids} />;
}
