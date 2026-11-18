import Link from 'next/link';
import { productionCtxFromSession } from '@/lib/production/session';
import { listPos } from '@/lib/production/purchaseOrders';
import { branchesFor } from '@/lib/production/common';
import { isBranchScoped } from '@/lib/branchScope';
import { fmtDate, fmtMoney } from '@/lib/format';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import Icon from '@/components/icons/Icon';
import StatusPill from '@/components/production/receipts/StatusPill';
import { isId, supplierOptions } from '@/components/production/receipts/serverData';

export async function generateMetadata() {
  return { title: (await getDict()).production.purchase.metaTitle };
}

const STATUSES = ['draft', 'sent', 'partial', 'received', 'cancelled'] as const;
const OPEN = new Set(['draft', 'sent', 'partial']);
const PAGE_SIZE = 30;

type Sp = { status?: string; supplier?: string; branch?: string; q?: string; page?: string };

/** Xaridlar (yetkazib beruvchiga buyurtmalar) ro'yxati: holat («Ochiq» — kutilayotganlar), yetkazib beruvchi, ombor */
export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const ctx = await productionCtxFromSession();
  const d = ctx.d;
  const t = d.production.purchase;
  const c = d.production.common;
  const scoped = isBranchScoped(ctx.user);
  const canCreate = ctx.perms.has('po.manage');

  const status = sp.status === 'open' || (STATUSES as readonly string[]).includes(sp.status ?? '') ? (sp.status as string) : '';
  const supplier = isId(sp.supplier) ? sp.supplier : '';
  const branch = !scoped && isId(sp.branch) ? sp.branch : '';
  const q = (sp.q ?? '').trim().slice(0, 80);
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  const [res, suppliers, branches] = await Promise.all([
    listPos(ctx, { status: status || undefined, supplierId: supplier || undefined, branchId: branch || undefined, q: q || undefined, page, limit: PAGE_SIZE }),
    supplierOptions(ctx),
    scoped ? Promise.resolve([]) : branchesFor(ctx),
  ]);

  const url = (patch: Partial<Sp>) => {
    const p = new URLSearchParams();
    const merged: Sp = { status, supplier, branch, q, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    const s = p.toString();
    return `/app/purchase-orders${s ? `?${s}` : ''}`;
  };
  const hasFilter = !!(status || supplier || branch || q);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="rc-page">
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{t.title}</h1>
          <p className="t-page-sub">{t.sub}</p>
        </div>
        <div className="t-page-actions">
          <Link href="/app/receipts" className="btn btn-ghost btn-with-icon ux-hide-mobile">
            <Icon name="download" size={16} /> {t.toReceipts}
          </Link>
          {canCreate && (
            <Link href="/app/purchase-orders/new" className="btn btn-primary btn-with-icon ux-hide-mobile">
              <Icon name="plus" size={17} /> {t.add}
            </Link>
          )}
        </div>
      </div>
      {canCreate && <Link href="/app/purchase-orders/new" className="ux-fab" aria-label={t.add}><Icon name="plus" size={18} /> {t.add}</Link>}

      <nav className="rc-chips ux-scrollx" aria-label={d.common.status}>
        <Link href={url({ status: '', page: '' })} className="st-chip" aria-current={!status ? 'page' : undefined}>{d.common.all}</Link>
        <Link href={url({ status: 'open', page: '' })} className="st-chip" aria-current={status === 'open' ? 'page' : undefined}>{t.statusOpen}</Link>
        {STATUSES.map((s) => (
          <Link key={s} href={url({ status: s, page: '' })} className="st-chip" aria-current={status === s ? 'page' : undefined}>
            {c.poStatuses[s]}
          </Link>
        ))}
      </nav>

      <form method="get" className="rc-filters" role="search" aria-label={t.title}>
        {status && <input type="hidden" name="status" value={status} />}
        <label className="rc-filter rc-filter--q">
          <span className="sr-only">{d.common.search}</span>
          <Icon name="search" size={16} />
          <input type="search" name="q" defaultValue={q} placeholder={t.searchPh} autoComplete="off" />
        </label>
        <label className="rc-filter">
          <span className="sr-only">{c.supplier}</span>
          <select name="supplier" defaultValue={supplier}>
            <option value="">{d.production.receipts.allSuppliers}</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        {branches.length > 1 && (
          <label className="rc-filter">
            <span className="sr-only">{c.warehouse}</span>
            <select name="branch" defaultValue={branch}>
              <option value="">{d.production.receipts.allBranches}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
        <button type="submit" className="btn btn-primary btn-sm">{d.common.filter}</button>
        {hasFilter && <Link href="/app/purchase-orders" className="btn btn-ghost btn-sm">{d.common.reset}</Link>}
      </form>

      {!res.ok ? (
        <p className="t-note t-note--warn" role="alert">{res.error}</p>
      ) : res.data.items.length === 0 ? (
        <div className="rc-card ux-empty">
          <span className="ux-empty-ic"><Icon name={hasFilter ? 'search' : 'send'} size={26} /></span>
          <b>{hasFilter ? t.emptyFilter : t.empty}</b>
          {!hasFilter && <p>{t.emptyHint}</p>}
          {hasFilter ? (
            <Link href="/app/purchase-orders" className="btn btn-tinted">{d.production.receipts.clearFilter}</Link>
          ) : canCreate && (
            <Link href="/app/purchase-orders/new" className="btn btn-primary btn-with-icon"><Icon name="plus" size={17} /> {t.add}</Link>
          )}
        </div>
      ) : (
        <>
          <p className="rc-found">{tr(d.production.receipts.found, { n: res.data.total })}</p>
          <ul className="rc-docs" aria-label={t.title}>
            {res.data.items.map((p) => {
              const overdue = !!p.expectedAt && OPEN.has(p.status) && new Date(p.expectedAt) < today;
              return (
                <li key={p.id}>
                  <Link href={`/app/purchase-orders/${p.id}`} className="rc-doc">
                    <span className="rc-doc-top">
                      <span className="rc-doc-no">{p.docNo}</span>
                      <StatusPill kind="po" status={p.status} label={c.poStatuses[p.status]} />
                    </span>
                    <span className="rc-doc-main">
                      <b>{p.supplierName}</b>
                      <small>
                        {[
                          !scoped ? p.branchName : null,
                          tr(d.production.receipts.linesN, { n: p.lines }),
                          OPEN.has(p.status) ? (p.open > 0 ? tr(t.openLines, { n: p.open }) : t.allReceived) : null,
                        ].filter(Boolean).join(' · ')}
                      </small>
                    </span>
                    <span className="rc-doc-side">
                      <b className="t-num">{p.total !== null ? <>{fmtMoney(p.total)} <small>{d.common.sum}</small></> : <span className="rc-muted">{d.production.receipts.priceHidden}</span>}</b>
                      <small className={overdue ? 'rc-c-bad' : undefined}>
                        {p.expectedAt ? `${t.expectedAt}: ${fmtDate(p.expectedAt)}${overdue ? ` · ${t.overdue}` : ''}` : fmtDate(p.createdAt ?? new Date())}
                      </small>
                    </span>
                    <Icon name="chevron" size={16} className="rc-doc-chev" />
                  </Link>
                </li>
              );
            })}
          </ul>
          {res.data.total > PAGE_SIZE && (
            <nav className="rc-pager" aria-label={d.production.receipts.pagerLabel}>
              {page > 1 && <Link href={url({ page: String(page - 1) })} className="btn btn-ghost btn-sm">{d.production.receipts.prevPage}</Link>}
              <span>{page} / {Math.ceil(res.data.total / PAGE_SIZE)}</span>
              {page * PAGE_SIZE < res.data.total && <Link href={url({ page: String(page + 1) })} className="btn btn-ghost btn-sm">{d.production.receipts.nextPage}</Link>}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
