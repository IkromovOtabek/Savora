import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Types } from 'mongoose';
import BackLink from '@/components/ui/BackLink';
import Icon from '@/components/icons/Icon';
import { Avatar } from '@/components/tenant/ClientsUi';
import { SupplierForm, SupplierEntryForm, DeleteSupplierEntryButton, DeleteSupplierBox } from '@/components/tenant/SupplierUi';
import { getTenantSession } from '@/lib/tenantSession';
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

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();
  const { Supplier, SupplierEntry, Product } = await getTenantSession();
  const supplier = await Supplier.findById(id).lean();
  if (!supplier) notFound();
  const d = await getDict();
  const s = d.stock.suppliers;

  const [balances, entries, products, productCount] = await Promise.all([
    loadSupplierBalances(SupplierEntry, [supplier._id]),
    SupplierEntry.find({ supplierId: supplier._id }).sort({ at: -1 }).limit(ENTRY_LIMIT).lean(),
    Product.find({ supplierId: supplier._id }, { name: 1, productId: 1, quantity: 1, status: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(PRODUCT_LIMIT).lean(),
    Product.countDocuments({ supplierId: supplier._id }),
  ]);
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
          <SupplierEntryForm supplierId={id} debt={b.debt} />

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
                    <DeleteSupplierEntryButton entryId={String(e._id)} />
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

          <SupplierForm
            mode="edit"
            initial={{ id, name: supplier.name, phone: supplier.phone ?? '', company: supplier.company ?? '', notes: supplier.notes ?? '' }}
          />

          <DeleteSupplierBox supplierId={id} name={supplier.name} blocked={entries.length > 0 || productCount > 0} />
        </div>
      </div>
    </div>
  );
}
