import DayFlowPage from '@/components/tenant/DayFlowPage';
import { getDict } from '@/lib/i18n/server';

export async function generateMetadata() {
  return { title: (await getDict()).sales.kassa.flowMetaTitle };
}

/** Kassa → «Kirim-chiqim». Layout: kassa moduli + kassa.view; filial login — faqat o'z filiali. */
export default async function KassaDayFlowPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  return <DayFlowPage variant="kassa" date={date} />;
}
