import { redirect } from 'next/navigation';
import { productionCtxFromSession } from '@/lib/production/session';
import { productionMeta } from '@/lib/production/catalog';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import BackLink from '@/components/ui/BackLink';
import PoForm from '@/components/production/purchase/PoForm';
import { isId, prefillFromIds, supplierOptions } from '@/components/production/receipts/serverData';

export async function generateMetadata() {
  return { title: (await getDict()).production.purchase.newTitle };
}

/** Yangi buyurtma (yetkazib beruvchiga). `?supplier=` — yetkazib beruvchi oldindan tanlanadi */
export default async function NewPurchaseOrderPage({ searchParams }: { searchParams: Promise<{ supplier?: string; items?: string; b?: string }> }) {
  const sp = await searchParams;
  const ctx = await productionCtxFromSession();
  if (!ctx.perms.has('po.manage')) redirect(`/app/locked?p=${encodeURIComponent('po.manage')}`);
  const t = ctx.d.production.purchase;
  // `?items=` — «Kam qolgan» blokidan (yetmagan miqdor bilan oldindan to'ldiriladi), `?b=` — ombor
  const [meta, suppliers, prefill] = await Promise.all([productionMeta(ctx), supplierOptions(ctx), prefillFromIds(ctx, sp.items)]);
  if (!meta.ok) return <p className="t-note t-note--warn" role="alert">{meta.error}</p>;
  const m = meta.data;
  const preset = isId(sp.supplier) && suppliers.some((s) => s.id === sp.supplier) ? sp.supplier : null;

  return (
    <div className="rc-page">
      <BackLink href="/app/purchase-orders">{t.backToList}</BackLink>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{t.newTitle}</h1>
          <p className="t-page-sub">{t.newSub}</p>
        </div>
      </div>
      {prefill.length > 0 && <p className="rc-note rc-note--info" role="status">{tr(ctx.d.production.receipts.prefilled, { n: prefill.length })}</p>}
      <PoForm
        po={null}
        presetSupplierId={preset}
        lineProducts={{}}
        branches={m.branches.map((b) => ({ id: b.id, name: b.name }))}
        defaultBranchId={isId(sp.b) && m.branches.some((b) => b.id === sp.b) ? sp.b : m.defaultBranchId}
        prefill={prefill}
        suppliers={suppliers}
        canAddSupplier={ctx.perms.has('suppliers.manage')}
        canViewPrices={m.can.viewPrices}
        draftReceipt={null}
      />
    </div>
  );
}
