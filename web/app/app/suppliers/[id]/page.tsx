import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Types } from 'mongoose';
import BackLink from '@/components/ui/BackLink';
import Icon from '@/components/icons/Icon';
import { Avatar } from '@/components/tenant/ClientsUi';
import { SupplierForm, SupplierEntryForm, DeleteSupplierEntryButton, DeleteSupplierBox } from '@/components/tenant/SupplierUi';
import { getTenantSession } from '@/lib/tenantSession';
import StatusPill from '@/components/production/receipts/StatusPill';
import { loadUserPermissions } from '@/lib/permissionGuard';
import { loadSupplierBalances } from '@/lib/suppliers';
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import '@/components/tenant/styles/clients.css';
import '@/components/tenant/styles/suppliers.css';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.stock.suppliers.detailMetaTitle };
}

const ENTRY_LIMIT = 200;
const PRODUCT_LIMIT = 30;
const DOC_LIMIT = 10;

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();
  const { Supplier, SupplierEntry, Product, GoodsReceipt, PurchaseOrder, user, features } = await getTenantSession();
  const perms = await loadUserPermissions(user);
  const canManage = perms.has('suppliers.manage');
  const canDelete = perms.has('suppliers.delete');
  const supplier = await Supplier.findById(id).lean();
  if (!supplier) notFound();
  const d = await getDict();
  const s = d.stock.suppliers;

  // Kirim aktlari va xaridlar (purchasing moduli): ko'rish — receipts/purchase-orders layout'lari bilan bir qoida
  const canReceipt = features.purchasing && perms.has('receipt.create');
  const canPo = features.purchasing && perms.has('po.manage');
  const showDocs = features.purchasing && (canReceipt || canPo || perms.has('suppliers.view'));
  const [balances, entries, products, productCount, receipts, orders] = await Promise.all([
    loadSupplierBalances(SupplierEntry, [supplier._id]),
    SupplierEntry.find({ supplierId: supplier._id }).sort({ at: -1 }).limit(ENTRY_LIMIT).lean(),
    Product.find({ supplierId: supplier._id }, { name: 1, productId: 1, quantity: 1, status: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(PRODUCT_LIMIT).lean(),
    Product.countDocuments({ supplierId: supplier._id }),
    showDocs ? GoodsReceipt.find({ supplierId: supplier._id }).select('docNo status total createdAt').sort({ createdAt: -1 }).limit(DOC_LIMIT).lean() : Promise.resolve([]),
    showDocs ? PurchaseOrder.find({ supplierId: supplier._id }).select('docNo status total createdAt').sort({ createdAt: -1 }).limit(DOC_LIMIT).lean() : Promise.resolve([]),
  ]);
  const c = d.production.common;
  const docs = [
    ...receipts.map((r) => ({ id: String(r._id), kind: 'receipt' as const, href: `/app/receipts/${r._id}`, no: r.docNo, status: r.status, label: c.receiptStatuses[r.status], total: r.total, at: r.createdAt })),
    ...orders.map((o) => ({ id: String(o._id), kind: 'po' as const, href: `/app/purchase-orders/${o._id}`, no: o.docNo, status: o.status, label: c.poStatuses[o.status], total: o.total, at: o.createdAt })),
  ].sort((x, y) => new Date(y.at ?? 0).getTime() - new Date(x.at ?? 0).getTime()).slice(0, DOC_LIMIT);
  const b = balances.get(id) ?? { purchased: 0, paid: 0, debt: 0 };

  return (
    <div className="cl-page">
      <BackLink href="/app/suppliers">{s.title}</BackLink>

      <div className="cl-profile">
        <aside className="cl-card cl-pcard" aria-label={supplier.name}>
          <Avatar name={supplier.name} size="lg" />
          <h1 className="cl-pcard-name">{supplier.name}</h1>
          {supplier.company && <small className="cl-pcard-since">{supplier.company}</small>}
          {supplier.createdAt && <small className="cl-pcard-since">{tr(s.since, { date: fmtDate(supplier.createdAt) })}</small>}
          {supplier.phone && (
            <div className="cl-pcard-acts">
              <a href={`tel:${supplier.phone}`} className="btn btn-tinted btn-with-icon"><Icon name="phone" size={16} /> {s.call}</a>
            </div>
          )}
          <div className="cl-ptotals">
            <div><span>{s.purchased}</span><b className="t-num">{fmtMoney(b.purchased)}</b></div>
            <div><span>{s.paid}</span><b className="t-num">{fmtMoney(b.paid)}</b></div>
            <div className={b.debt > 0 ? 'cl-ptotals--gold' : ''}><span>{s.debt}</span><b className="t-num">{fmtMoney(b.debt)}</b></div>
          </div>
        </aside>

        <div className="sp-main">
          {canManage && <SupplierEntryForm supplierId={id} debt={b.debt} />}

          {showDocs && (
            <section className="cl-card" aria-labelledby="sp-docs-h">
              <div className="sp-docs-head sp-h--pad">
                <h2 id="sp-docs-h" className="sp-h">{s.docs.title}</h2>
                <div className="sp-docs-acts">
                  {canReceipt && (
                    <Link href={`/app/receipts/new?supplier=${id}`} className="btn btn-tinted btn-sm btn-with-icon"><Icon name="plus" size={14} /> {s.docs.newReceipt}</Link>
                  )}
                  {canPo && (
                    <Link href={`/app/purchase-orders/new?supplier=${id}`} className="btn btn-ghost btn-sm btn-with-icon"><Icon name="plus" size={14} /> {s.docs.newPo}</Link>
                  )}
                </div>
              </div>
              {docs.length === 0 ? (
                <p className="sp-muted sp-pad">{s.docs.empty}</p>
              ) : (
                <ul className="sp-entries">
                  {docs.map((x) => (
                    <li key={x.id} className="sp-entry">
                      <span className="sp-entry-ic" aria-hidden><Icon name={x.kind === 'receipt' ? 'box' : 'clipboard'} size={16} /></span>
                      <div className="sp-entry-main">
                        <b><Link href={x.href} className="cell-link">{x.kind === 'receipt' ? s.docs.receipt : s.docs.po} {x.no}</Link></b>
                        <span>{x.at ? fmtDate(x.at) : ''}</span>
                      </div>
                      <StatusPill kind={x.kind} status={x.status} label={x.label} />
                      <span className="sp-entry-amt t-num">{fmtMoney(x.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {receipts.length > 0 && <Link href={`/app/receipts?supplier=${id}`} className="sp-docs-all cell-link">{s.docs.all}</Link>}
            </section>
          )}

          <section className="cl-card" aria-labelledby="sp-hist-h">
            <h2 id="sp-hist-h" className="sp-h sp-h--pad">{s.history.title}</h2>
            {entries.length === 0 ? (
              <p className="sp-muted sp-pad">{s.history.empty}</p>
            ) : (
              <ul className="sp-entries">
                {entries.map((e) => (
                  <li key={String(e._id)} className={`sp-entry sp-entry--${e.type}`}>
                    <span className="sp-entry-ic" aria-hidden><Icon name={e.type === 'purchase' ? 'box' : 'wallet'} size={16} /></span>
                    <div className="sp-entry-main">
                      <b>{e.type === 'purchase' ? s.entry.purchase : s.entry.payment}</b>
                      <span>
                        {fmtDateTime(e.at)} · {e.by}
                        {e.productId ? ` · ${s.history.auto}` : ''}
                        {e.note ? ` · ${e.note}` : ''}
                      </span>
                    </div>
                    <span className="sp-entry-amt t-num">{e.type === 'purchase' ? '+' : '−'}{fmtMoney(e.amount)}</span>
                    {canDelete && <DeleteSupplierEntryButton entryId={String(e._id)} />}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="cl-card" aria-labelledby="sp-prod-h">
            <h2 id="sp-prod-h" className="sp-h sp-h--pad">{s.products.title} <small className="sp-muted">({productCount})</small></h2>
            {products.length === 0 ? (
              <p className="sp-muted sp-pad">{s.products.empty}</p>
            ) : (
              <>
                <ul className="sp-products">
                  {products.map((p) => (
                    <li key={String(p._id)}>
                      <Link href={`/app/products/${p._id}`}>{p.name}</Link>
                      <small className="sp-muted">{d.stock.status[p.status as keyof typeof d.stock.status] ?? p.status}</small>
                    </li>
                  ))}
                </ul>
                {productCount > PRODUCT_LIMIT && <p className="sp-muted sp-pad">{tr(s.products.more, { n: PRODUCT_LIMIT })}</p>}
              </>
            )}
          </section>

          {canManage && (
            <SupplierForm
              mode="edit"
              initial={{ id, name: supplier.name, phone: supplier.phone ?? '', company: supplier.company ?? '', notes: supplier.notes ?? '' }}
            />
          )}

          {canDelete && <DeleteSupplierBox supplierId={id} name={supplier.name} blocked={entries.length > 0 || productCount > 0} />}
        </div>
      </div>
    </div>
  );
}
