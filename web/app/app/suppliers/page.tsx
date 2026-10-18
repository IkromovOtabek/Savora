import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { searchPattern } from '@/lib/security';
import { fmtMoney } from '@/lib/format';
import { loadSupplierBalances } from '@/lib/suppliers';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import Icon from '@/components/icons/Icon';
import { Avatar, EmptyState } from '@/components/tenant/ClientsUi';
import '@/components/tenant/styles/clients.css';
import '@/components/tenant/styles/suppliers.css';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.stock.suppliers.metaTitle };
}

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const { Supplier, SupplierEntry } = await getTenantSession();
  const d = await getDict();
  const s = d.stock.suppliers;

  const q = (sp.q ?? '').trim();
  const filter: Record<string, unknown> = {};
  if (q) {
    const pattern = searchPattern(q);
    filter.$or = ['name', 'company', 'phone'].map((k) => ({ [k]: { $regex: pattern, $options: 'i' } }));
  }

  // Do'konda yetkazib beruvchilar odatda o'nlab — sahifalashsiz, qarz bo'yicha tartiblanadi
  const [suppliers, balances] = await Promise.all([
    Supplier.find(filter).sort({ name: 1 }).limit(500).lean(),
    loadSupplierBalances(SupplierEntry),
  ]);
  const rows = suppliers
    .map((x) => ({ x, b: balances.get(String(x._id)) ?? { purchased: 0, paid: 0, debt: 0 } }))
    .sort((a, b) => b.b.debt - a.b.debt);
  const debtors = [...balances.values()].filter((b) => b.debt > 0);
  const totalDebt = debtors.reduce((sum, b) => sum + b.debt, 0);

  return (
    <div className="cl-page">
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{s.title}</h1>
          <p className="t-page-sub">{s.sub} · <strong>{tr(s.count, { n: suppliers.length })}</strong></p>
        </div>
        <div className="t-page-actions ux-hide-mobile">
          <Link href="/app/suppliers/new" className="btn btn-primary btn-with-icon"><Icon name="plus" size={16} /> {s.addBtn}</Link>
        </div>
      </div>
      <Link href="/app/suppliers/new" className="ux-fab" aria-label={s.newTitle}><Icon name="plus" size={18} /> {s.addBtn}</Link>

      <section className="cl-card sp-total" aria-label={s.totalDebt}>
        <span className="sp-total-ic" aria-hidden><Icon name="wallet" size={22} /></span>
        <div>
          <span className="sp-total-l">{s.totalDebt}</span>
          <b className={`sp-total-v t-num${totalDebt > 0 ? ' cl-c-bad' : ''}`}>{fmtMoney(totalDebt)} <small>{d.common.sum}</small></b>
          <small className="sp-muted">{tr(s.totalDebtSub, { n: debtors.length })}</small>
        </div>
      </section>

      <form method="get" className="cl-search" role="search">
        <label htmlFor="sp-q" className="cl-search-field">
          <Icon name="search" size={17} />
          <span className="sr-only">{s.searchLabel}</span>
          <input id="sp-q" name="q" type="search" defaultValue={q} placeholder={s.searchPh} autoComplete="off" />
        </label>
        <button type="submit" className="btn btn-primary">{d.common.search}</button>
        {q && <Link href="/app/suppliers" className="btn btn-ghost">{d.common.reset}</Link>}
      </form>

      {rows.length === 0 ? (
        <div className="cl-card">
          {q ? (
            <EmptyState icon="search" title={s.notFoundTitle} text={tr(s.notFoundText, { q })} />
          ) : (
            <EmptyState icon="store" title={s.emptyTitle} text={s.emptyText} action={{ href: '/app/suppliers/new', label: s.firstAdd }} />
          )}
        </div>
      ) : (
        <ul className="cl-cgrid" aria-label={s.title}>
          {rows.map(({ x, b }) => (
            <li key={String(x._id)}>
              <Link href={`/app/suppliers/${x._id}`} className="cl-ccard">
                <Avatar name={x.name} />
                <span className="cl-ccard-body">
                  <b className="cl-row-name">{x.name}</b>
                  <small className="cl-row-sub">{[x.company, x.phone].filter(Boolean).join(' · ') || '—'}</small>
                  <small className={`cl-ccard-meta t-num${b.debt > 0 ? ' cl-c-bad' : ''}`}>
                    {b.debt > 0 ? `${s.debt}: ${fmtMoney(b.debt)} ${d.common.sum}` : s.noDebt}
                  </small>
                </span>
                <Icon name="chevron" size={16} className="cl-chev" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
