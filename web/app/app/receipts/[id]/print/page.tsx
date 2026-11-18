import { notFound } from 'next/navigation';
import { productionCtxFromSession } from '@/lib/production/session';
import { receiptPrintData } from '@/lib/production/receipts';
import { getDict } from '@/lib/i18n/server';
import BackLink from '@/components/ui/BackLink';
import PrintButton from '@/components/ui/PrintButton';
import ReceiptSheet from '@/components/production/receipts/ReceiptSheet';
import { isId } from '@/components/production/receipts/serverData';

export async function generateMetadata() {
  return { title: `${(await getDict()).production.print.title} — Savora` };
}

/**
 * Kirim nakladnoyi — A4 chop etish (ma'lumot: GET /api/production/receipts/:id?print=1 bilan bir xil —
 * receiptPrintData). Narxlar faqat kelish narxini ko'rish huquqi bilan; qoralama/bekor — belgi bilan.
 */
export default async function ReceiptPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isId(id)) notFound();
  const ctx = await productionCtxFromSession();
  const d = ctx.d;
  const t = d.production.receipts;
  const res = await receiptPrintData(ctx, id);
  if (!res.ok) {
    if (res.code === 'receiptNotFound') notFound();
    return <p className="t-note t-note--warn" role="alert">{res.error}</p>;
  }
  const v = res.data;

  return (
    <div className="rc-print">
      {/* Faqat shu sahifada: A4 (global qoida — 80 mm chek) */}
      <style>{'@media print{@page{size:A4 portrait;margin:12mm}}'}</style>

      <div className="rc-print-bar no-print">
        <BackLink href={`/app/receipts/${id}`}>{t.printBack}</BackLink>
        <PrintButton label={d.common.print} />
      </div>

      <ReceiptSheet v={v} d={d} />
    </div>
  );
}
