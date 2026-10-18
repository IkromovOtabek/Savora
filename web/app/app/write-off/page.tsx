import StockAdjustPage from '@/components/tenant/StockAdjustPage';
import { getDict } from '@/lib/i18n/server';

export async function generateMetadata() {
  return { title: (await getDict()).stock.adjust.woMeta };
}

export default function WriteOffPage() {
  return <StockAdjustPage mode="writeoff" />;
}
