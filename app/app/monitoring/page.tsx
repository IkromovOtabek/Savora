import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { statsFromSales, monthRange } from '@/lib/monitoring';
import { PAYMENT_TYPE_LABELS, PaymentType } from '@/lib/models/tenant/Sale';
import { fmtMoney } from '@/lib/format';
import MonitoringChart from '@/components/tenant/MonitoringChart';
import type { BranchMonthFlow } from '@/lib/inventoryFlow';

export const metadata = { title: 'Hisobot — Savora' };

export default async function MonitoringPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const [y, m] = (sp.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`).split('-').map(Number);
  const { start, end } = monthRange(y, m);

  const { Sale, Branch, Product } = await getTenantSession();

  const [sales, branches] = await Promise.all([
    Sale.find({ status: { $ne: 'cancelled' }, createdAt: { $gte: start, $lt: end } }).lean(),
    Branch.find({ active: true }).lean(),
  ]);

  const branchMap = Object.fromEntries(branches.map((b) => [String(b._id), b.name]));

  // Sotilgan mahsulotlar — Sale.createdAt asosida (to'g'ri sana)
  // Product.updatedAt ishlatilmaydi — u tahrirlash vaqtida ham o'zgaradi
  const soldProductIds = sales.map((s) => s.productId);
  const soldProducts = soldProductIds.length > 0
    ? await Product.find({ _id: { $in: soldProductIds } }).lean()
    : [];
  const soldProductMap = Object.fromEntries(soldProducts.map((p) => [String(p._id), p]));

  // Omborga kirgan mahsulotlar (createdAt shu oyda) — chiqim
  const incomingProducts = await Product.find({
    branchId: { $in: branches.map((b) => b._id) },
    createdAt: { $gte: start, $lt: end },
  }).lean();

  // Filial bo'yicha hisob — Sale.createdAt = sotuv sanasi (ishonchli)
  const branchFlowMap = new Map<string, BranchMonthFlow>();
  for (const b of branches) {
    branchFlowMap.set(String(b._id), {
      branchId: String(b._id),
      name: b.name,
      kirimQty: 0,
      chiqimQty: 0,
      kirimSum: 0,
      chiqimSum: 0,
      profit: 0,
    });
  }

  // Sotilganlar — Sale.createdAt bo'yicha (kirim = pul kirishi)
  for (const sale of sales) {
    const branchId = String(sale.branchId);
    const row = branchFlowMap.get(branchId);
    if (!row) continue;
    const product = soldProductMap[String(sale.productId)];
    const qty = sale.productSnapshot?.saleQuantity ?? 1;
    const purchasePrice = sale.productSnapshot?.purchasePrice ?? product?.purchasePrice ?? 0;
    row.kirimQty += qty;
    row.kirimSum += sale.totalAmount;
    row.profit += sale.totalAmount - purchasePrice * qty;
  }

  // Omborga kirgan — Product.createdAt bo'yicha (chiqim = pul ketishi)
  for (const p of incomingProducts) {
    const branchId = String(p.branchId);
    const row = branchFlowMap.get(branchId);
    if (!row) continue;
    const qty = p.trackQuantity ? (p.quantity ?? 1) : 1;
    row.chiqimQty += qty;
    row.chiqimSum += (p.purchasePrice ?? 0) * qty;
  }

  const branchFlows = [...branchFlowMap.values()].sort((a, b) => b.profit - a.profit);

  const monthStats = statsFromSales(sales, start, end);

  const branchStats = branches.map((b) => {
    const branchSales = sales.filter((s) => String(s.branchId) === String(b._id));
    return { name: b.name, ...statsFromSales(branchSales, start, end) };
  }).sort((a, b) => b.revenue - a.revenue);

  const byPayment: Record<string, number> = {};
  for (const s of sales) {
    byPayment[s.paymentType] = (byPayment[s.paymentType] ?? 0) + s.totalAmount;
  }

  const monthKirim = branchFlows.reduce((s, r) => s + r.kirimQty, 0);
  const monthChiqim = branchFlows.reduce((s, r) => s + r.chiqimQty, 0);
  const monthProfit = branchFlows.reduce((s, r) => s + r.profit, 0);

  const monthLabel = start.toLocaleDateString('uz-UZ', { month: 'long', year: 'numeric' });

  return (
    <>
      <div className="dash-head">
        <div>
          <h1 className="dash-hello">Hisobot</h1>
          <p className="dash-sub">Oylik hisobot — {monthLabel}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/api/export/sales" className="btn btn-ghost">Sotuvlar CSV</Link>
          <Link href="/api/export/products" className="btn btn-ghost">Ombor CSV</Link>
        </div>
      </div>

      <form method="get" className="search-bar panel" style={{ padding: '16px 20px', marginBottom: 20 }}>
        <div className="imei-search-row">
          <div className="auth-field" style={{ flex: 1, margin: 0, maxWidth: 220 }}>
            <label htmlFor="month">Oy</label>
            <input id="month" name="month" type="month" defaultValue={`${y}-${String(m).padStart(2, '0')}`} />
          </div>
          <button type="submit" className="btn btn-primary btn-sm">Ko&apos;rish</button>
        </div>
      </form>

      <div className="dash-stats">
        <div className="dash-stat dash-stat--ok"><div className="dash-stat-n">{monthKirim} ta</div><div className="dash-stat-l">Sotuv (dona)</div></div>
        <div className="dash-stat"><div className="dash-stat-n">{monthChiqim} ta</div><div className="dash-stat-l">Omborga kirgan</div></div>
        <div className="dash-stat dash-stat--ok"><div className="dash-stat-n">{fmtMoney(monthProfit)}</div><div className="dash-stat-l">Foyda</div></div>
        <div className="dash-stat"><div className="dash-stat-n">{monthStats.salesCount}</div><div className="dash-stat-l">Tranzaksiyalar</div></div>
        <div className="dash-stat dash-stat--ok"><div className="dash-stat-n">{fmtMoney(monthStats.revenue)}</div><div className="dash-stat-l">Aylanma</div></div>
      </div>

      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head"><h2>Filiallar bo&apos;yicha jadval</h2></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Filial</th>
                <th>Sotuv (ta)</th>
                <th>Kirim (ta)</th>
                <th>Sotuv summa</th>
                <th>Xarid summa</th>
                <th>Foyda</th>
                <th>Tranzaksiya</th>
              </tr>
            </thead>
            <tbody>
              {branchFlows.map((b) => {
                const saleRow = branchStats.find((s) => s.name === b.name);
                return (
                  <tr key={b.branchId}>
                    <td>{b.name}</td>
                    <td>{b.kirimQty}</td>
                    <td>{b.chiqimQty}</td>
                    <td>{fmtMoney(b.kirimSum)}</td>
                    <td>{fmtMoney(b.chiqimSum)}</td>
                    <td>{fmtMoney(b.profit)}</td>
                    <td>{saleRow?.salesCount ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head"><h2>Filiallar — grafik</h2></div>
        <div style={{ padding: '20px 24px' }}>
          <MonitoringChart rows={branchFlows} />
        </div>
      </div>

      <div className="two-col">
        <div className="panel">
          <div className="panel-head"><h2>Sotuv bo&apos;yicha filiallar</h2></div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Filial</th><th>Sotuv</th><th>Aylanma</th><th>Foyda</th></tr></thead>
              <tbody>
                {branchStats.map((b) => (
                  <tr key={b.name}><td>{b.name}</td><td>{b.salesCount}</td><td>{fmtMoney(b.revenue)}</td><td>{fmtMoney(b.profit)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>To&apos;lov turi</h2></div>
          <div className="detail-body" style={{ padding: '20px 24px' }}>
            {(Object.keys(PAYMENT_TYPE_LABELS) as PaymentType[]).map((t) => (
              <div key={t} className="detail-row">
                <span className="detail-l">{PAYMENT_TYPE_LABELS[t]}</span>
                <strong>{fmtMoney(byPayment[t] ?? 0)}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
