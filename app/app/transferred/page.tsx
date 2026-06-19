import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { fmtDateTime } from '@/lib/format';

export const metadata = { title: 'Filialga berildi — Savora' };

export default async function TransferredPage() {
  const { Transfer } = await getTenantSession();

  const transfers = await Transfer.find().sort({ createdAt: -1 }).limit(200).lean();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCount = transfers.filter((t) => new Date(t.createdAt!) >= todayStart).length;
  const totalQty = transfers.reduce((s, t) => s + (t.quantity ?? 0), 0);

  return (
    <>
      <div className="dash-head">
        <div>
          <h1 className="dash-hello">Filialga berildi</h1>
          <p className="dash-sub">Bugun: {todayCount} ta · Jami berilgan: {totalQty} dona</p>
        </div>
        <Link href="/app/products" className="btn btn-ghost">Omborga o&apos;tish</Link>
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        {transfers.length === 0 ? (
          <div className="panel-empty">
            <p>Hali filialga berilgan mahsulot yo&apos;q.</p>
            <Link href="/app/products" className="btn btn-primary">Omborga o&apos;tish</Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>№ / Sana</th>
                  <th>Mahsulot</th>
                  <th>Soni</th>
                  <th>Qayerdan</th>
                  <th>Qayerga</th>
                  <th>Kim</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => (
                  <tr key={String(t._id)}>
                    <td>
                      <div className="cell-main">{t.transferNo}</div>
                      <div className="cell-sub">{fmtDateTime(t.createdAt!)}</div>
                    </td>
                    <td>
                      <Link href={`/app/products/${t.productId}`} className="cell-link cell-main">{t.productSnapshot.name}</Link>
                      <code className="imei-code">{t.productSnapshot.imei}</code>
                    </td>
                    <td><strong>{t.quantity}</strong> dona</td>
                    <td>{t.fromBranchName ?? '—'}</td>
                    <td><span className="badge-status badge-status--active">{t.toBranchName}</span></td>
                    <td>{t.transferredBy}</td>
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
