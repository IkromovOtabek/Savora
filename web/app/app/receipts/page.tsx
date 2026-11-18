import Link from 'next/link';
import { productionCtxFromSession } from '@/lib/production/session';
import { listReceipts } from '@/lib/production/receipts';
import { branchesFor } from '@/lib/production/common';
import { isBranchScoped } from '@/lib/branchScope';
import { fmtDate, fmtMoney } from '@/lib/format';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import Icon from '@/components/icons/Icon';
import StatusPill from '@/components/production/receipts/StatusPill';
import { dayParam, isId, supplierOptions } from '@/components/production/receipts/serverData';

export async function generateMetadata() {
  return { title: (await getDict()).production.receipts.metaTitle };
}

const STATUSES = ['draft', 'posted', 'cancelled'] as const;
const PAGE_SIZE = 30;

type Sp = { status?: string; supplier?: string; branch?: string; from?: string; to?: string; q?: string; page?: string };

/** Kirim aktlari ro'yxati: holat, yetkazib beruvchi, davr, ombor (admin) va matn bo'yicha filtr */
export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const ctx = await productionCtxFromSession();
  const d = ctx.d;
  const t = d.production.receipts;
  const c = d.production.common;
  const scoped = isBranchScoped(ctx.user);
  const canCreate = ctx.perms.has('receipt.create');
  const canPo = ctx.perms.has('po.manage') || ctx.perms.has('receipt.create');

  const status = (STATUSES as readonly string[]).includes(sp.status ?? '') ? (sp.status as (typeof STATUSES)[number]) : '';
  const supplier = isId(sp.supplier) ? sp.supplier : '';
  const branch = !scoped && isId(sp.branch) ? sp.branch : '';
  const from = dayParam(sp.from);
  const to = dayParam(sp.to);
  const q = (sp.q ?? '').trim().slice(0, 80);
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  const [res, suppliers, branches] = await Promise.all([
    listReceipts(ctx, { status: status || undefined, supplierId: supplier || undefined, branchId: branch || undefined, from, to, q: q || undefined, page, limit: PAGE_SIZE }),
    supplierOptions(ctx),
    scoped ? Promise.resolve([]) : branchesFor(ctx),
  ]);

  const url = (patch: Partial<Sp>) => {
    const p = new URLSearchParams();
    const merged: Sp = { status, supplier, branch, from: from ? sp.from : '', to: to ? sp.to : '', q, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    const s = p.toString();
    return `/app/receipts${s ? `?${s}` : ''}`;
  };
  const hasFilter = !!(status || supplier || branch || from || to || q);

  return (
    <div className="rc-page">
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{t.title}</h1>
          <p className="t-page-sub">{t.sub}</p>
        </div>
        <div className="t-page-actions">
          {canPo && (
            <Link href="/app/purchase-orders" className="btn btn-ghost btn-with-icon ux-hide-mobile">
              <Icon name="send" size={16} /> {t.toPurchaseOrders}
            </Link>
          )}
          {canCreate && (
            <Link href="/app/receipts/new" className="btn btn-primary btn-with-icon ux-hide-mobile">
              <Icon name="plus" size={17} /> {t.add}
            </Link>
          )}
        </div>
      </div>
      {canCreate && <Link href="/app/receipts/new" className="ux-fab" aria-label={t.add}><Icon name="plus" size={18} /> {t.add}</Link>}

      <nav className="rc-chips ux-scrollx" aria-label={d.common.status}>
        <Link href={url({ status: '', page: '' })} className="st-chip" aria-current={!status ? 'page' : undefined}>{d.common.all}</Link>
        {STATUSES.map((s) => (
          <Link key={s} href={url({ status: s, page: '' })} className="st-chip" aria-current={status === s ? 'page' : undefined}>
            {c.receiptStatuses[s]}
          </Link>
        ))}
      </nav>

      <form method="get" className="rc-filters" role="search" aria-label={t.filtersLabel}>
        {status && <input type="hidden" name="status" value={status} />}
        <label className="rc-filter rc-filter--q">
          <span className="sr-only">{d.common.search}</span>
          <Icon name="search" size={16} />
          <input type="search" name="q" defaultValue={q} placeholder={t.searchPh} autoComplete="off" />
        </label>
        <label className="rc-filter">
          <span className="sr-only">{c.supplier}</span>
          <select name="supplier" defaultValue={supplier}>
            <option value="">{t.allSuppliers}</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        {branches.length > 1 && (
          <label className="rc-filter">
            <span className="sr-only">{c.warehouse}</span>
            <select name="branch" defaultValue={branch}>
              <option value="">{t.allBranches}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
        <label className="rc-filter rc-filter--date">
          <span>{t.periodFrom}</span>
          <input type="date" name="from" defaultValue={from ? sp.from : ''} />
        </label>
        <label className="rc-filter rc-filter--date">
          <span>{t.periodTo}</span>
          <input type="date" name="to" defaultValue={to ? sp.to : ''} />
        </label>
        <button type="submit" className="btn btn-primary btn-sm">{d.common.filter}</button>
        {hasFilter && <Link href="/app/receipts" className="btn btn-ghost btn-sm">{d.common.reset}</Link>}
      </form>

      {!res.ok ? (
        <p className="t-note t-note--warn" role="alert">{res.error}</p>
      ) : res.data.items.length === 0 ? (
        <div className="rc-card ux-empty">
          <span className="ux-empty-ic"><Icon name={hasFilter ? 'search' : 'download'} size={26} /></span>
          <b>{hasFilter ? t.emptyFilter : t.empty}</b>
          {!hasFilter && <p>{t.emptyHint}</p>}
          {hasFilter ? (
            <Link href="/app/receipts" className="btn btn-tinted">{t.clearFilter}</Link>
          ) : canCreate && (
            <Link href="/app/receipts/new" className="btn btn-primary btn-with-icon"><Icon name="plus" size={17} /> {t.add}</Link>
          )}
        </div>
      ) : (
        <>
          <p className="rc-found">{tr(t.found, { n: res.data.total })}</p>
          <ul className="rc-docs" aria-label={t.title}>
            {res.data.items.map((r) => (
              <li key={r.id}>
                <Link href={`/app/receipts/${r.id}`} className="rc-doc">
                  <span className="rc-doc-top">
                    <span className="rc-doc-no">{r.docNo}</span>
                    <StatusPill kind="receipt" status={r.status} label={c.receiptStatuses[r.status]} />
                  </span>
                  <span className="rc-doc-main">
                    <b>{r.supplierName ?? t.noSupplier}</b>
                    <small>
                      {[
                        !scoped ? r.branchName : null,
                        r.supplierInvoiceNo ? `${t.invoiceNo}: ${r.supplierInvoiceNo}` : null,
                        r.purchaseOrderNo,
                        tr(t.linesN, { n: r.lines }),
                      ].filter(Boolean).join(' · ')}
                    </small>
                  </span>
                  <span className="rc-doc-side">
                    <b className="t-num">{r.total !== null ? <>{fmtMoney(r.total)} <small>{d.common.sum}</small></> : <span className="rc-muted">{t.priceHidden}</span>}</b>
                    <small>{fmtDate(r.postedAt ?? r.createdAt ?? new Date())} · {r.createdBy}</small>
                  </span>
                  <Icon name="chevron" size={16} className="rc-doc-chev" />
                </Link>
              </li>
            ))}
          </ul>
          {res.data.total > PAGE_SIZE && (
            <nav className="rc-pager" aria-label={t.pagerLabel}>
              {page > 1 && <Link href={url({ page: String(page - 1) })} className="btn btn-ghost btn-sm">{t.prevPage}</Link>}
              <span>{page} / {Math.ceil(res.data.total / PAGE_SIZE)}</span>
              {page * PAGE_SIZE < res.data.total && <Link href={url({ page: String(page + 1) })} className="btn btn-ghost btn-sm">{t.nextPage}</Link>}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
