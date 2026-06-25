import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantSession } from '@/lib/tenantSession';
import { dayRange, extractKassaPayments } from '@/lib/kassa';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import KassaDateFilter from '@/components/tenant/KassaDateFilter';
import BackLink from '@/components/ui/BackLink';

export async function generateMetadata({ params }: { params: Promise<{ branchId: string }> }) {
  return { title: 'Naxt kassa — batafsil — Savora' };
}

export default async function KassaBranchPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { branchId } = await params;
  const sp = await searchParams;
  const { Sale, Branch } = await getTenantSession();

  const branch = await Branch.findById(branchId).lean();
  if (!branch) notFound();

  const { start, end, label } = dayRange(sp.date ?? new Date().toISOString().slice(0, 10));

  const sales = await Sale.find({
    branchId: branch._id,
    status: { $ne: 'cancelled' },
    $or: [
      { createdAt: { $gte: new Date(start.getTime() - 90 * 24 * 60 * 60 * 1000) } },
      { 'payments.paidAt': { $gte: start, $lt: end } },
    ],
  }).lean();

  const allRows = extractKassaPayments(sales, start, end);
  const rows = allRows.filter((r) => r.paymentType === 'cash');
  const total = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <div className="dash-head">
        <div>
          <div style={{ marginBottom: 8 }}>
            <BackLink href="/app/kassa" className="btn btn-ghost btn-sm">
              Orqaga
            </BackLink>
          </div>
          <h1 className="dash-hello">{branch.name}</h1>
          <p className="dash-sub">Naqd to&apos;lovlar · {label}</p>
        </div>
        <Link href="/app/sales/new" className="btn btn-primary">+ Sotuv</Link>
      </div>

      <KassaDateFilter initialDate={label} basePath={`/app/kassa/${branchId}`} />

      <div className="dash-stats" style={{ marginBottom: 20 }}>
        <div className="dash-stat dash-stat--ok">
          <div className="dash-stat-n">{fmtMoney(total)}</div>
          <div className="dash-stat-l">Kunlik naqd tushum</div>
        </div>
        <div className="dash-stat">
          <div className="dash-stat-n">{rows.length}</div>
          <div className="dash-stat-l">To&apos;lovlar soni</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Naqd to&apos;lovlar ({rows.length})</h2>
        </div>
        {rows.length === 0 ? (
          <div className="panel-empty">
            <p>Bu kunda naqd tushum yo&apos;q.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Vaqt</th>
                  <th>Sotuv</th>
                  <th>Mijoz</th>
                  <th>Summa</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.saleId}-${i}`}>
                    <td data-label="Vaqt">{fmtDateTime(r.paidAt)}</td>
                    <td data-label="Sotuv">
                      <Link href={`/app/sales/${r.saleId}`} className="cell-link cell-main">{r.saleNo}</Link>
                      <div className="cell-sub">{r.productName}</div>
                    </td>
                    <td data-label="Mijoz">{r.customerName}</td>
                    <td data-label="Summa"><strong>{fmtMoney(r.amount)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
