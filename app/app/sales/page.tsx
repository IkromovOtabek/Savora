import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
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
  const { Sale, Product, Branch } = await getTenantSession();

  const filter: Record<string, unknown> = {};
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

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todaySales = await Sale.countDocuments({ createdAt: { $gte: todayStart }, status: { $ne: 'cancelled' } });
  const debtTotal = await Sale.aggregate([
    { $match: { status: 'partial' } },
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
          <div className="table-wrap">
            <table className="data-table data-table--sold">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Status</th>
                  <th>Manba</th>
                  <th>Model</th>
                  <th>Rang</th>
                  <th>IMEI</th>
                  <th>Olingan narx</th>
                  <th>Sotilgan narx</th>
                  <th>Yo&apos;nalish</th>
                  <th>Izoh</th>
                  <th>Sana</th>
                  <th>Amallar</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s, i) => {
                  const prod = productMap[String(s.productId)];
                  const source = branchMap[String(s.branchId)] ?? '—';
                  const qty = s.productSnapshot.saleQuantity ?? 1;
                  const unit = qty > 0 ? Math.round(s.totalAmount / qty) : s.totalAmount;
                  const cancelled = s.status === 'cancelled';
                  return (
                    <tr key={String(s._id)} className={cancelled ? 'row-cancelled' : ''}>
                      <td>{i + 1}</td>
                      <td>
                        <span className={`badge-status badge-status--${cancelled ? 'expired' : 'active'}`}>
                          {cancelled ? 'Bekor' : 'Sotildi'}
                        </span>
                      </td>
                      <td><span className="source-chip">{source} dan kelgan</span></td>
                      <td>
                        <Link href={`/app/products/${s.productId}`} className="cell-link cell-main">
                          {prod?.deviceModel || prod?.name || s.productSnapshot.name}
                        </Link>
                        {qty > 1 && <div className="cell-sub">Soni: {qty} ta</div>}
                      </td>
                      <td>{prod?.color || '—'}</td>
                      <td><code className="imei-code">{s.productSnapshot.imei}</code></td>
                      <td>{fmtMoney(s.productSnapshot.purchasePrice ?? prod?.purchasePrice ?? 0)} UZS</td>
                      <td className="cell-main">{fmtMoney(unit)} UZS</td>
                      <td>{PAYMENT_TYPE_LABELS[s.paymentType as PaymentType]}</td>
                      <td>{prod?.notes || s.notes || '—'}</td>
                      <td>{fmtDate(s.createdAt!)}</td>
                      <td className="cell-actions">
                        <div className="row-actions">
                          <Link href={`/app/sales/${s._id}`} className="btn btn-ghost btn-sm">Batafsil</Link>
                          {!cancelled && <SaleRowDelete saleId={String(s._id)} saleNo={s.saleNo} />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
