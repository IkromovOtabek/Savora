import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { branchFilter, branchAggMatch } from '@/lib/branchScope';
import { PAYMENT_TYPE_LABELS, SALE_STATUS_LABELS, PaymentType, SaleStatus } from '@/lib/models/tenant/Sale';
import { fmtDate, fmtMoney } from '@/lib/format';
import SaleRowDelete from '@/components/tenant/SaleRowDelete';

export const metadata = { title: 'Sotuvlar — Savora' };

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const { user, Sale, Product, Branch } = await getTenantSession();

  const scope = branchFilter(user);
  const filter: Record<string, unknown> = { ...scope };
  if (sp.status && sp.status in SALE_STATUS_LABELS) filter.status = sp.status;
  if (sp.type && sp.type in PAYMENT_TYPE_LABELS) filter.paymentType = sp.type;

  const sales = await Sale.find(filter).sort({ createdAt: -1 }).limit(200).lean();

  // Boyitish uchun mahsulot va filial ma'lumotlari
  const productIds = [...new Set(sales.map((s) => String(s.productId)))];
  const [products, branches] = await Promise.all([
    Product.find({ _id: { $in: productIds } }).lean(),
    Branch.find().lean(),
  ]);
  const productMap = Object.fromEntries(products.map((p) => [String(p._id), p]));
  const branchMap = Object.fromEntries(branches.map((b) => [String(b._id), b.name]));

  // Jadval va mobil kartalar uchun bir marta hisoblangan qatorlar
  const rows = sales.map((s, i) => {
    const prod = productMap[String(s.productId)];
    const qty = s.productSnapshot.saleQuantity ?? 1;
    const unit = qty > 0 ? Math.round(s.totalAmount / qty) : s.totalAmount;
    const cancelled = s.status === 'cancelled';
    const isDebt = s.status === 'partial' || s.paymentType === 'installment' || s.paymentType === 'debt';
    return {
      id: String(s._id),
      no: i + 1,
      saleNo: s.saleNo,
      productId: String(s.productId),
      name: prod?.deviceModel || prod?.name || s.productSnapshot.name,
      color: prod?.color || '—',
      qty,
      source: branchMap[String(s.branchId)] ?? '—',
      imei: s.productSnapshot.imei,
      purchase: s.productSnapshot.purchasePrice ?? prod?.purchasePrice ?? 0,
      unit,
      typeLabel: PAYMENT_TYPE_LABELS[s.paymentType as PaymentType],
      note: prod?.notes || s.notes || '—',
      date: fmtDate(s.createdAt!),
      cancelled,
      isDebt,
    };
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todaySales = await Sale.countDocuments({ ...scope, createdAt: { $gte: todayStart }, status: { $ne: 'cancelled' } });
  const debtTotal = await Sale.aggregate([
    { $match: { ...branchAggMatch(user), status: 'partial' } },
    { $group: { _id: null, total: { $sum: '$remainingAmount' } } },
  ]);

  return (
    <>
      <div className="dash-head">
        <div>
          <h1 className="dash-hello">Sotildi</h1>
          <p className="dash-sub">Bugun: {todaySales} ta · Qarzdorlik: {fmtMoney(debtTotal[0]?.total ?? 0)} so&apos;m</p>
        </div>
        <Link href="/app/sales/new" className="btn btn-primary">+ Yangi sotuv</Link>
      </div>

      <div className="filter-chips">
        <Link href="/app/sales" className={`chip${!sp.status && !sp.type ? ' chip--active' : ''}`}>Barchasi</Link>
        <Link href="/app/sales?status=partial" className={`chip${sp.status === 'partial' ? ' chip--active' : ''}`}>Qarzdor</Link>
        <Link href="/app/sales?type=cash" className={`chip${sp.type === 'cash' ? ' chip--active' : ''}`}>Naqd</Link>
        <Link href="/app/sales?type=debt" className={`chip${sp.type === 'debt' ? ' chip--active' : ''}`}>Qarz</Link>
        <Link href="/app/sales?type=installment" className={`chip${sp.type === 'installment' ? ' chip--active' : ''}`}>Nasiya</Link>
        <Link href="/app/sales?type=bank_credit" className={`chip${sp.type === 'bank_credit' ? ' chip--active' : ''}`}>Bank krediti</Link>
        <a href="/api/export/sales" className="chip">CSV export</a>
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        {sales.length === 0 ? (
          <div className="panel-empty">
            <p>Sotuv topilmadi.</p>
            <Link href="/app/sales/new" className="btn btn-primary">Birinchi sotuvni qilish</Link>
          </div>
        ) : (
          <div className="table-wrap sold-table-wrap">
            <table className="data-table data-table--sold">
              <colgroup>
                <col className="sold-col sold-col--num" />
                <col className="sold-col sold-col--status" />
                <col className="sold-col sold-col--source" />
                <col className="sold-col sold-col--model" />
                <col className="sold-col sold-col--color" />
                <col className="sold-col sold-col--imei" />
                <col className="sold-col sold-col--price" />
                <col className="sold-col sold-col--type" />
                <col className="sold-col sold-col--note" />
                <col className="sold-col sold-col--date" />
                <col className="sold-col sold-col--actions" />
              </colgroup>
              <thead>
                <tr>
                  <th>№</th>
                  <th>Status</th>
                  <th>Manba</th>
                  <th>Model</th>
                  <th>Rang</th>
                  <th>IMEI</th>
                  <th>Narx</th>
                  <th>Yo&apos;nalish</th>
                  <th>Izoh</th>
                  <th>Sana</th>
                  <th>Amallar</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={r.cancelled ? 'row-cancelled' : ''}>
                    <td data-label="№">{r.no}</td>
                    <td data-label="Status">
                      <span className={`badge-status badge-status--${r.cancelled ? 'expired' : 'active'}`}>
                        {r.cancelled ? 'Bekor' : 'Sotildi'}
                      </span>
                    </td>
                    <td data-label="Manba"><span className="source-chip">{r.source}</span></td>
                    <td data-label="Model">
                      <div className="sold-cell-stack">
                        <Link href={`/app/products/${r.productId}`} className="cell-link cell-main">{r.name}</Link>
                        {r.qty > 1 && <div className="cell-sub">Soni: {r.qty} ta</div>}
                      </div>
                    </td>
                    <td data-label="Rang">{r.color}</td>
                    <td data-label="IMEI"><code className="imei-code">{r.imei}</code></td>
                    <td data-label="Narx">
                      <div className="sold-cell-stack">
                        <div className="cell-sub">Olingan: {fmtMoney(r.purchase)}</div>
                        <div className="cell-main">Sotilgan: {fmtMoney(r.unit)}</div>
                      </div>
                    </td>
                    <td data-label="Yo&apos;nalish">{r.typeLabel}</td>
                    <td data-label="Izoh">{r.note}</td>
                    <td data-label="Sana">{r.date}</td>
                    <td className="cell-actions">
                      <div className="row-actions">
                        <Link href={`/app/sales/${r.id}`} className="btn btn-ghost btn-sm">Batafsil</Link>
                        {!r.cancelled && <SaleRowDelete saleId={r.id} saleNo={r.saleNo} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Mobil — toza kartalar (jadval o'rniga) */}
        {sales.length > 0 && (
          <div className="sold-cards">
            {rows.map((r) => (
              <div key={r.id} className={`sold-card${r.cancelled ? ' sold-card--cancelled' : ''}`}>
                <div className="sold-card-top">
                  <span className="sold-card-no">#{r.no}</span>
                  <span className={`badge-status badge-status--${r.cancelled ? 'expired' : 'active'}`}>
                    {r.cancelled ? 'Bekor' : 'Sotildi'}
                  </span>
                  <span className="sold-card-date">{r.date}</span>
                </div>
                <Link href={`/app/products/${r.productId}`} className="sold-card-name">{r.name}</Link>
                <div className="sold-card-meta">Soni: {r.qty} ta · Rang: {r.color}</div>
                <div className="sold-card-grid">
                  <div className="sold-card-field">
                    <span className="sold-card-l">Manba</span>
                    <span className="source-chip">{r.source}</span>
                  </div>
                  <div className="sold-card-field">
                    <span className="sold-card-l">IMEI</span>
                    <code className="imei-code">{r.imei}</code>
                  </div>
                </div>
                <div className="sold-card-foot">
                  <div className="sold-card-price">
                    <span className="sold-card-l">Narx ({r.typeLabel})</span>
                    <span className="sold-card-old">Olingan: {fmtMoney(r.purchase)}</span>
                    <span className={`sold-card-new${r.isDebt ? ' sold-card-new--debt' : ''}`}>{fmtMoney(r.unit)} so&apos;m</span>
                  </div>
                  <div className="row-actions">
                    <Link href={`/app/sales/${r.id}`} className="btn btn-ghost btn-sm">Batafsil</Link>
                    {!r.cancelled && <SaleRowDelete saleId={r.id} saleNo={r.saleNo} />}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
