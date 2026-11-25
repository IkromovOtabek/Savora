import DayFlowPage from '@/components/tenant/DayFlowPage';
import { getDict } from '@/lib/i18n/server';

export async function generateMetadata() {
  return { title: (await getDict()).sales.kassa.flowMetaTitle };
}

/** Moliya → «Kirim-chiqim» (egasi, barcha filiallar). Layout: egasi + kirimChiqim moduli — kassa moduli o'chiq bo'lsa ham ishlaydi. */
export default async function FinanceDayFlowPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  return <DayFlowPage variant="finance" date={date} />;
}
