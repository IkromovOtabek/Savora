import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { searchPattern } from '@/lib/security';
import { fmtDate } from '@/lib/format';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import Icon from '@/components/icons/Icon';
import { Avatar, EmptyState } from '@/components/tenant/ClientsUi';
import '@/components/tenant/styles/clients.css';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.crm.customers.metaTitle };
}

const PAGE_SIZE = 50;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; created?: string }>;
}) {
  const sp = await searchParams;
  const { Customer } = await getTenantSession();
  const d = await getDict();
  const cs = d.crm.customers;

  const q = (sp.q ?? '').trim();
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const filter: Record<string, unknown> = {};
  if (q) {
    // Regex injection/ReDoS himoyasi: ekranlangan, 50 belgigacha
    const pattern = searchPattern(q);
    filter.$or = [
      { fullName: { $regex: pattern, $options: 'i' } },
      { phone: { $regex: pattern, $options: 'i' } },
    ];
  }

  const [customers, total] = await Promise.all([
    Customer.find(filter).sort({ createdAt: -1 }).skip(skip).limit(PAGE_SIZE).lean(),
    Customer.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function pageUrl(p: number) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (p > 1) params.set('page', String(p));
    const s = params.toString();
    return `/app/customers${s ? `?${s}` : ''}`;
  }

  return (
    <div className="cl-page">
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{cs.title}</h1>
          <p className="t-page-sub">
            <strong>{tr(cs.count, { n: total })}</strong>
            {totalPages > 1 ? ` · ${tr(cs.pageN, { n: page })}` : ''}
          </p>
        </div>
        <div className="t-page-actions ux-hide-mobile">
          <Link href="/app/customers/new" className="btn btn-primary btn-with-icon"><Icon name="plus" size={16} /> {cs.addBtn}</Link>
        </div>
      </div>
      <Link href="/app/customers/new" className="ux-fab" aria-label={cs.addAria}><Icon name="plus" size={18} /> {cs.addBtn}</Link>

      <form method="get" className="cl-search" role="search">
        <label htmlFor="cl-q" className="cl-search-field">
          <Icon name="search" size={17} />
          <span className="sr-only">{cs.searchLabel}</span>
          <input id="cl-q" name="q" type="search" defaultValue={q} placeholder={cs.searchPlaceholder} autoComplete="off" />
        </label>
        <button type="submit" className="btn btn-primary">{d.common.search}</button>
        {q && <Link href="/app/customers" className="btn btn-ghost">{d.common.reset}</Link>}
      </form>

      {customers.length === 0 ? (
        <div className="cl-card">
          {q ? (
            <EmptyState icon="search" title={cs.notFoundTitle} text={tr(cs.notFoundText, { q })} action={{ href: '/app/customers', label: cs.clearSearch }} />
          ) : (
            <EmptyState icon="users" title={cs.emptyTitle} text={cs.emptyText} action={{ href: '/app/customers/new', label: cs.firstCustomer }} />
          )}
        </div>
      ) : (
        <>
          <ul className="cl-cgrid" aria-label={cs.listAria}>
            {customers.map((c) => (
              <li key={String(c._id)}>
                <Link href={`/app/customers/${c._id}`} className="cl-ccard">
                  <Avatar name={c.fullName} photoUrl={c.photoUrl} />
                  <span className="cl-ccard-body">
                    <b className="cl-row-name">{c.fullName}</b>
                    <small className="cl-row-sub t-num">{c.phone}</small>
                    <small className="cl-ccard-meta">
                      {c.address ? <><Icon name="map" size={12} /> {c.address}</> : c.createdAt ? tr(d.crm.customers.addedAt, { date: fmtDate(c.createdAt) }) : ''}
                    </small>
                  </span>
                  <Icon name="chevron" size={16} className="cl-chev" />
                </Link>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <nav className="cl-pager" aria-label={cs.pagesAria}>
              {page > 1 ? (
                <Link href={pageUrl(page - 1)} className="btn btn-ghost btn-with-icon"><Icon name="arrowLeft" size={15} /> {d.common.prev}</Link>
              ) : <span />}
              <span className="t-num">{page} / {totalPages}</span>
              {page < totalPages ? (
                <Link href={pageUrl(page + 1)} className="btn btn-ghost btn-with-icon">{d.common.next} <Icon name="arrowRight" size={15} /></Link>
              ) : <span />}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
