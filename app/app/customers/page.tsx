import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';

export const metadata = { title: 'Mijozlar — Savora' };

const PAGE_SIZE = 50;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; created?: string }>;
}) {
  const sp = await searchParams;
  const { Customer } = await getTenantSession();

  const q = (sp.q ?? '').trim();
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const filter: Record<string, unknown> = {};
  if (q) {
    filter.$or = [
      { fullName: { $regex: q, $options: 'i' } },
      { phone: { $regex: q, $options: 'i' } },
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
    <>
      <div className="dash-head dash-head--simple">
        <div>
          <h1 className="dash-hello">Mijozlar</h1>
          <p className="dash-sub">
            {total} ta mijoz
            {totalPages > 1 ? ` · ${page}-sahifa` : ''}
          </p>
        </div>
        <Link href="/app/customers/new" className="btn btn-primary">+ Mijoz</Link>
      </div>

      {sp?.created === '1' && (
        <div className="auth-alert auth-alert--info" style={{ marginBottom: 16 }}>Mijoz qo&apos;shildi.</div>
      )}

      <form method="get" className="search-bar panel" style={{ padding: '12px 16px', marginBottom: 16 }}>
        <div className="imei-search-row">
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Ism yoki telefon raqami..."
            className="search-input"
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn btn-primary btn-sm">Qidirish</button>
          {q && <Link href="/app/customers" className="btn btn-ghost btn-sm">Tozalash</Link>}
        </div>
      </form>

      <div className="panel">
        {customers.length === 0 ? (
          <div className="panel-empty">
            <p>{q ? `"${q}" bo'yicha mijoz topilmadi.` : 'Hozircha mijoz yo\'q.'}</p>
            {!q && <Link href="/app/customers/new" className="btn btn-primary">Birinchi mijoz</Link>}
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table data-table--simple">
                <thead>
                  <tr><th>Ism</th><th>Telefon</th><th>Manzil</th><th></th></tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={String(c._id)}>
                      <td className="cell-main" data-label="Ism">{c.fullName}</td>
                      <td data-label="Telefon">{c.phone}</td>
                      <td className="cell-sub" data-label="Manzil">{c.address || '—'}</td>
                      <td data-label="">
                        <Link href={`/app/customers/${c._id}`} className="btn btn-ghost btn-sm">Tahrirlash</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="pagination">
                {page > 1 && (
                  <Link href={pageUrl(page - 1)} className="btn btn-ghost btn-sm">← Oldingi</Link>
                )}
                <span className="pagination-info">{page} / {totalPages}</span>
                {page < totalPages && (
                  <Link href={pageUrl(page + 1)} className="btn btn-ghost btn-sm">Keyingi →</Link>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
