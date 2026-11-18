import Link from 'next/link';
import { notFound } from 'next/navigation';
import { productionCtxFromSession } from '@/lib/production/session';
import { getReceipt } from '@/lib/production/receipts';
import { productionMeta } from '@/lib/production/catalog';
import { fmtDateTime } from '@/lib/format';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import BackLink from '@/components/ui/BackLink';
import Icon from '@/components/icons/Icon';
import StatusPill from '@/components/production/receipts/StatusPill';
import ReceiptForm from '@/components/production/receipts/ReceiptForm';
import ReceiptDoc from '@/components/production/receipts/ReceiptDoc';
import ReceiptCancelButton from '@/components/production/receipts/ReceiptCancelButton';
import { isId, lineProductsFor, supplierOptions } from '@/components/production/receipts/serverData';

export async function generateMetadata() {
  return { title: `${(await getDict()).production.common.receipt} — Savora` };
}

/** Kirim akti: qoralama — tahrir + «Kirim qilish»; kirim qilingan/bekor — faqat ko'rish va chop etish */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isId(id)) notFound();
  const ctx = await productionCtxFromSession();
  const d = ctx.d;
  const t = d.production.receipts;
  const c = d.production.common;
  const got = await getReceipt(ctx, id);
  if (!got.ok) {
    if (got.code === 'receiptNotFound') notFound();
    return <p className="t-note t-note--warn" role="alert">{got.error}</p>;
  }
  const r = got.data.receipt;

  const info = r.status === 'posted' && r.postedAt
    ? tr(t.postedInfo, { date: fmtDateTime(r.postedAt), by: r.postedBy ?? r.createdBy })
    : r.status === 'cancelled' && r.cancelledAt
      ? tr(t.cancelledInfo, { date: fmtDateTime(r.cancelledAt) })
      : t.draftInfo;
  const created = r.createdAt ? tr(t.createdInfo, { date: fmtDateTime(r.createdAt), by: r.createdBy }) : '';

  let form: React.ReactNode = null;
  if (r.can.edit) {
    const [meta, suppliers, lineProducts] = await Promise.all([productionMeta(ctx), supplierOptions(ctx), lineProductsFor(ctx, r.lines)]);
    if (meta.ok) {
      form = (
        <ReceiptForm
          key={`${r.id}:${r.rev}`}
          receipt={r}
          lineProducts={lineProducts}
          branches={meta.data.branches.map((b) => ({ id: b.id, name: b.name }))}
          defaultBranchId={r.branchId}
          suppliers={suppliers}
          canAddSupplier={ctx.perms.has('suppliers.manage')}
          canViewPrices={r.can.viewPrices}
          canSetPayment={r.can.setPayment}
          canPost={r.can.post}
        />
      );
    }
  }

  return (
    <div className="rc-page">
      <BackLink href="/app/receipts">{t.backToList}</BackLink>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title rc-title">
            <span>{c.receipt} <span className="rc-mono">{r.docNo}</span></span>
            <StatusPill kind="receipt" status={r.status} label={c.receiptStatuses[r.status]} />
          </h1>
          <p className="t-page-sub">{[info, r.status !== 'posted' ? created : ''].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="t-page-actions">
          {r.status === 'draft' && r.can.cancel && <ReceiptCancelButton id={r.id} />}
          <Link href={`/app/receipts/${r.id}/print`} className="btn btn-ghost btn-with-icon">
            <Icon name="download" size={16} /> {t.print}
          </Link>
        </div>
      </div>

      {form ?? <ReceiptDoc r={r} d={d} />}
    </div>
  );
}
