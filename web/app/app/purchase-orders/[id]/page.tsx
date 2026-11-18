import { notFound } from 'next/navigation';
import { productionCtxFromSession } from '@/lib/production/session';
import { getPo } from '@/lib/production/purchaseOrders';
import { listReceipts } from '@/lib/production/receipts';
import { productionMeta } from '@/lib/production/catalog';
import { fmtDateTime } from '@/lib/format';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import BackLink from '@/components/ui/BackLink';
import StatusPill from '@/components/production/receipts/StatusPill';
import PoForm from '@/components/production/purchase/PoForm';
import PoDoc, { PoReceipts } from '@/components/production/purchase/PoDoc';
import PoActions from '@/components/production/purchase/PoActions';
import { isId, lineProductsFor, supplierOptions } from '@/components/production/receipts/serverData';

export async function generateMetadata() {
  return { title: `${(await getDict()).production.common.purchaseOrder} — Savora` };
}

/**
 * Buyurtma: qoralama/yuborilgan (qabul boshlanmagan) — tahrir; aks holda ko'rish. Amallar `can` bo'yicha:
 * «Yuborildi», «Qabul qilish» → kirim qoralamasi → kirim sahifasi, bekor qilish. Pastda — shu buyurtma kirimlari.
 */
export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isId(id)) notFound();
  const ctx = await productionCtxFromSession();
  const d = ctx.d;
  const t = d.production.purchase;
  const c = d.production.common;
  const got = await getPo(ctx, id);
  if (!got.ok) {
    if (got.code === 'poNotFound') notFound();
    return <p className="t-note t-note--warn" role="alert">{got.error}</p>;
  }
  const po = got.data.po;
  const linked = await listReceipts(ctx, { purchaseOrderId: po.id, limit: 50 });
  const receipts = linked.ok ? linked.data.items : [];
  const draft = receipts.find((r) => r.status === 'draft');
  const draftReceipt = draft ? { id: draft.id, docNo: draft.docNo } : null;

  const info = [
    po.createdAt ? tr(d.production.receipts.createdInfo, { date: fmtDateTime(po.createdAt), by: po.createdBy }) : null,
    po.sentAt ? tr(t.sentInfo, { date: fmtDateTime(po.sentAt) }) : null,
    po.receivedAt && po.status === 'received' ? tr(t.receivedInfo, { date: fmtDateTime(po.receivedAt) }) : null,
  ].filter(Boolean).join(' · ');

  // Tahrir qabul qoralamasi ochiq bo'lsa ham mumkin: server (savePo) qator id'larini saqlaydi — qoralamadagi
  // `poLineId` bog'lanishi uzilmaydi; olib tashlangan qatorga bog'langan kirim qatori kod bo'yicha qayta bog'lanadi
  let form: React.ReactNode = null;
  if (po.can.edit) {
    const [meta, suppliers, lineProducts] = await Promise.all([productionMeta(ctx), supplierOptions(ctx), lineProductsFor(ctx, po.lines)]);
    if (meta.ok) {
      form = (
        <PoForm
          key={`${po.id}:${po.rev}`}
          po={po}
          lineProducts={lineProducts}
          branches={meta.data.branches.map((b) => ({ id: b.id, name: b.name }))}
          defaultBranchId={po.branchId}
          suppliers={suppliers}
          canAddSupplier={ctx.perms.has('suppliers.manage')}
          canViewPrices={po.can.viewPrices}
          draftReceipt={draftReceipt}
        />
      );
    }
  }

  return (
    <div className="rc-page">
      <BackLink href="/app/purchase-orders">{t.backToList}</BackLink>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title rc-title">
            <span>{c.purchaseOrder} <span className="rc-mono">{po.docNo}</span></span>
            <StatusPill kind="po" status={po.status} label={c.poStatuses[po.status]} />
          </h1>
          {info && <p className="t-page-sub">{info}</p>}
        </div>
        {po.can.cancel && (
          <div className="t-page-actions">
            <PoActions id={po.id} can={{ send: false, receive: false, cancel: true }} draftReceipt={null} only={['cancel']} />
          </div>
        )}
      </div>

      {draftReceipt && po.can.receive && (
        <p className="rc-note rc-note--info" role="status">{tr(t.draftReceipt, { no: draftReceipt.docNo })}</p>
      )}

      {form ?? (
        <>
          <PoDoc po={po} d={d} />
          {(po.can.receive || po.can.send) && (
            <div className="rc-actions" role="group" aria-label={d.common.actions}>
              <span className="rc-actions-hint">{po.can.receive && !draftReceipt ? t.receiveHint : ''}</span>
              <PoActions id={po.id} can={{ send: po.can.send, receive: po.can.receive, cancel: false }} draftReceipt={draftReceipt} only={['send', 'receive']} />
            </div>
          )}
        </>
      )}

      {(receipts.length > 0 || po.status !== 'draft') && <PoReceipts items={receipts} d={d} />}
    </div>
  );
}
