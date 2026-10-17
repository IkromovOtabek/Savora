import { getTenantSession } from '@/lib/tenantSession';
import { userCan } from '@/lib/permissionGuard';
import { branchFilter, isBranchScoped } from '@/lib/branchScope';
import { statsFromSales, monthRange } from '@/lib/monitoring';
import { PAYMENT_TYPE_LABELS, PaymentType } from '@/lib/models/tenant/Sale';
import { getI18n } from '@/lib/i18n/server';
import { tr, fmtMonthYear } from '@/lib/i18n/fmt';
import { fmtMoney } from '@/lib/format';
import MonitoringChart from '@/components/tenant/MonitoringChart';
import type { BranchMonthFlow } from '@/lib/inventoryFlow';
import Icon from '@/components/icons/Icon';
import Tilt from '@/components/ui/Tilt';
import MoreMenu from '@/components/ui/MoreMenu';
import MonthNav from '@/components/ui/MonthNav';
import '@/components/tenant/styles/finance.css';

export async function generateMetadata() {
  const { d } = await getI18n();
  return { title: d.shell.monitoring.metaTitle };
}

export default async function MonitoringPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const [y, m] = (sp.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`).split('-').map(Number);
  const { start, end } = monthRange(y, m);

  const { user, Sale, Branch, Product, features } = await getTenantSession();
  const { locale, d } = await getI18n();
  const t = d.shell.monitoring;
  const canExport = features.export && (await userCan(user, 'export.data'));

  // Filial login — faqat o'z filiali hisoboti; admin — barcha filiallar taqqoslamasi
  const scope = branchFilter(user);
  const [sales, branchesAll] = await Promise.all([
    Sale.find({ ...scope, status: { $ne: 'cancelled' }, createdAt: { $gte: start, $lt: end } }).lean(),
    Branch.find({ active: true }).lean(),
  ]);
  const branches = isBranchScoped(user)
    ? branchesAll.filter((b) => String(b._id) === user.branchId)
    : branchesAll;

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

  // Nomlash: BranchMonthFlow.kirim* = sotuvdan pul kirishi (sotilgan dona/summa),
  // chiqim* = omborga kirgan mahsulot uchun pul ketishi (dona/xarid summa).
  const monthSoldQty = branchFlows.reduce((s, r) => s + r.kirimQty, 0);
  const monthIncomingQty = branchFlows.reduce((s, r) => s + r.chiqimQty, 0);
  const monthIncomingSum = branchFlows.reduce((s, r) => s + r.chiqimSum, 0);
  const monthProfit = branchFlows.reduce((s, r) => s + r.profit, 0);

  const ym = (yy: number, mm: number) => {
    const d = new Date(yy, mm - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const curMonth = ym(y, m);
  const nowMonth = ym(now.getFullYear(), now.getMonth() + 1);
  // Brauzer/Node tiliga bog'liq bo'lmagan yorliq — joriy interfeys tilida
  const monthLabel = fmtMonthYear(new Date(y, m - 1, 1), locale);

  const paymentTotal = Object.values(byPayment).reduce((s, v) => s + v, 0);
  const paymentTypes = Object.keys(PAYMENT_TYPE_LABELS) as PaymentType[];
  const share = (v: number) => (paymentTotal > 0 ? (v / paymentTotal) * 100 : 0);

  return (
    <div className="fn-page">
      <div className="t-page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="t-page-title">{t.title}</h1>
          <p className="t-page-sub">{t.subtitle}</p>
        </div>
        <div className="fn-head-tools">
          <MonthNav value={curMonth} current={nowMonth} href={(v) => `/app/monitoring?month=${v}`} />
          {canExport && (
            <MoreMenu label={d.common.download}>
              <a href="/api/export/sales"><Icon name="download" size={18} /> {t.salesCsv}</a>
              <a href="/api/export/products"><Icon name="download" size={18} /> {t.productsCsv}</a>
            </MoreMenu>
          )}
        </div>
      </div>

      <section className="fn-bento" aria-label={t.monthKpis}>
        <Tilt stack className="fn-hero">
          <div className="fn-hero-top">
            <span className="fn-hero-label">{t.turnover}</span>
            <span className="fn-hero-chip"><Icon name="chart" size={14} /> {monthLabel}</span>
          </div>
          <div className="fn-hero-value fn-num ux-z">{fmtMoney(monthStats.revenue)}<span className="fn-cur">{d.common.sum}</span></div>
          <div className="fn-hero-grid">
            <div className="fn-hero-stat">
              <span className="fn-hero-stat-l">{t.transactions}</span>
              <span className="fn-hero-stat-v fn-num">{tr(d.common.nPcs, { n: monthStats.salesCount })}</span>
            </div>
            <div className="fn-hero-stat">
              <span className="fn-hero-stat-l">{d.common.paid}</span>
              <span className="fn-hero-stat-v fn-num">{fmtMoney(monthStats.paid)}</span>
            </div>
            <div className="fn-hero-stat">
              <span className="fn-hero-stat-l">{t.remainingDebt}</span>
              <span className="fn-hero-stat-v fn-num">{fmtMoney(monthStats.debt)}</span>
            </div>
          </div>
        </Tilt>
        <div className="ux-strip fn-bento-tiles">
          <div className="fn-tile">
            <span className="fn-tile-head"><span className="ux-clay ux-clay--green"><Icon name="sparkles" size={15} /></span> {t.profit}</span>
            <span className={`fn-tile-v ${monthProfit >= 0 ? 'fn-in' : 'fn-out'}`}>{fmtMoney(monthProfit)}</span>
            <span className="fn-tile-s">{t.profitSub}</span>
          </div>
          <div className="fn-tile">
            <span className="fn-tile-head"><span className="ux-clay"><Icon name="cart" size={15} /></span> {t.sold}</span>
            <span className="fn-tile-v">{tr(d.common.nPcs, { n: monthSoldQty })}</span>
            <span className="fn-tile-s">{t.soldSub}</span>
          </div>
          <div className="fn-tile">
            <span className="fn-tile-head"><span className="ux-clay ux-clay--gold"><Icon name="box" size={15} /></span> {t.incoming}</span>
            <span className="fn-tile-v">{tr(d.common.nPcs, { n: monthIncomingQty })}</span>
            <span className="fn-tile-s">{t.incomingSub}</span>
          </div>
          <div className="fn-tile">
            <span className="fn-tile-head"><span className="ux-clay ux-clay--red"><Icon name="wallet" size={15} /></span> {t.purchaseSum}</span>
            <span className="fn-tile-v">{fmtMoney(monthIncomingSum)}</span>
            <span className="fn-tile-s">{t.purchaseSumSub}</span>
          </div>
        </div>
      </section>

      <div className="fn-two">
        <section className="fn-panel" aria-labelledby="mon-rank">
          <div className="fn-panel-head">
            <h2 id="mon-rank">{t.branchRank}</h2>
            <small>{t.bySaleSum}</small>
          </div>
          <div className="fn-panel-body">
            <MonitoringChart rows={branchFlows} />
          </div>
        </section>

        <section className="fn-panel" aria-labelledby="mon-pay">
          <div className="fn-panel-head">
            <h2 id="mon-pay">{t.paymentType}</h2>
            <small>{fmtMoney(paymentTotal)} {d.common.sum}</small>
          </div>
          <div className="fn-panel-body">
            <div className="fn-mix" aria-hidden="true">
              {paymentTypes.map((pt) =>
                (byPayment[pt] ?? 0) > 0 ? <i key={pt} className={`fn-c-${pt}`} style={{ width: `${share(byPayment[pt])}%` }} /> : null,
              )}
            </div>
            <ul className="fn-mix-list">
              {paymentTypes.map((pt) => (
                <li key={pt} className="fn-mix-row">
                  <i className={`fn-c-${pt}`} aria-hidden="true" />
                  <span>{d.shell.paymentTypes[pt] ?? PAYMENT_TYPE_LABELS[pt]}</span>
                  <strong>{fmtMoney(byPayment[pt] ?? 0)}</strong>
                  <small>{Math.round(share(byPayment[pt] ?? 0))}%</small>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <section className="fn-panel" aria-labelledby="mon-table">
        <div className="fn-panel-head">
          <h2 id="mon-table">{t.branchTable}</h2>
          <small>{tr(t.nBranches, { n: branchFlows.length })}</small>
        </div>
        {branchFlows.length === 0 ? (
          <div className="ux-empty">
            <span className="ux-empty-ic"><Icon name="store" size={26} /></span>
            <b>{t.noActiveBranch}</b>
            <p>{t.noActiveBranchText}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table fn-table">
              <thead>
                <tr>
                  <th>{d.common.branch}</th>
                  <th className="fn-right">{t.soldQty}</th>
                  <th className="fn-right">{t.incomingQty}</th>
                  <th className="fn-right">{t.saleSum}</th>
                  <th className="fn-right">{t.purchaseSum}</th>
                  <th className="fn-right">{t.profit}</th>
                  <th className="fn-right">{t.transaction}</th>
                </tr>
              </thead>
              <tbody>
                {branchFlows.map((b) => {
                  const saleRow = branchStats.find((s) => s.name === b.name);
                  return (
                    <tr key={b.branchId}>
                      <td data-label={d.common.branch}><span className="cell-main">{b.name}</span></td>
                      <td data-label={t.soldQty} className="fn-right">{b.kirimQty}</td>
                      <td data-label={t.incomingQty} className="fn-right">{b.chiqimQty}</td>
                      <td data-label={t.saleSum} className="fn-right">{fmtMoney(b.kirimSum)}</td>
                      <td data-label={t.purchaseSum} className="fn-right">{fmtMoney(b.chiqimSum)}</td>
                      <td data-label={t.profit} className={`fn-right ${b.profit >= 0 ? 'fn-in' : 'fn-out'}`}><strong>{fmtMoney(b.profit)}</strong></td>
                      <td data-label={t.transaction} className="fn-right">{saleRow?.salesCount ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
