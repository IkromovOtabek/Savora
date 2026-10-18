import StockAdjustPage from '@/components/tenant/StockAdjustPage';
import { getDict } from '@/lib/i18n/server';

export async function generateMetadata() {
  return { title: (await getDict()).stock.adjust.revalMeta };
}

export default function RevaluationPage() {
  return <StockAdjustPage mode="revaluation" />;
}
