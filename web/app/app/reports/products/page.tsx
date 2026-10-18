import { getTenantSession } from '@/lib/tenantSession';
import { branchAggMatch } from '@/lib/branchScope';
import { userCan } from '@/lib/permissionGuard';
import { parsePeriod, periodRange } from '@/lib/period';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import PeriodSeg from '@/components/tenant/PeriodSeg';
import BackLink from '@/components/ui/BackLink';
import { getDict } from '@/lib/i18n/server';
import '@/components/tenant/styles/reports.css';

export async function generateMetadata() {
  return { title: (await getDict()).shell.reports.productsMeta };
}

type Row = { _id: string; qty: number; count: number; revenue: number; cost: number; last: Date };

const LIMIT = 200;

export default async function ProductsReport({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const sp = await searchParams;
  const { user, Sale } = await getTenantSession();
  const d = await getDict();
  const r = d.shell.reports;
  const period = parsePeriod(sp?.p);
  const { start, end } = periodRange(period);
  const canViewCost = await userCan(user, 'product.viewCost');

  const rows = await Sale.aggregate<Row>([
    { $match: { ...branchAggMatch(user), createdAt: { $gte: start, $lt: end }, status: { $ne: 'cancelled' } } },
    { $group: {
      _id: { $ifNull: ['$productSnapshot.name', '—'] },
      qty: { $sum: { $ifNull: ['$productSnapshot.saleQuantity', 1] } },
      count: { $sum: 1 },
      revenue: { $sum: '$totalAmount' },
      cost: { $sum: { $multiply: [{ $ifNull: ['$productSnapshot.purchasePrice', 0] }, { $ifNull: ['$productSnapshot.saleQuantity', 1] }] } },
      last: { $max: '$createdAt' },
    } },
    { $sort: { revenue: -1 } },
    { $limit: LIMIT },
  ]);
  const total = rows.reduce((a, x) => ({ qty: a.qty + x.qty, revenue: a.revenue + x.revenue, cost: a.cost + x.cost }), { qty: 0, revenue: 0, cost: 0 });

  return (
    <>
      <BackLink href="/app/reports" className="btn btn-plain btn-sm">{r.back}</BackLink>
      <div className="t-page-head">
        <div><h1 className="t-page-title">{r.productsTitle}</h1></div>
        <PeriodSeg basePath="/app/reports/products" current={period} />
      </div>
      {rows.length === 0 ? (
        <div className="rp-empty">{r.empty}</div>
      ) : (
        <div className="table-wrap rp-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{r.colProduct}</th>
                <th className="num">{r.colQty}</th>
                <th className="num">{r.colRevenue}</th>
                {canViewCost && <th className="num">{r.colProfit}</th>}
                <th className="num">{r.colShare}</th>
                <th className="num">{r.colLast}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => {
                const share = total.revenue ? Math.round((x.revenue / total.revenue) * 100) : 0;
                return (
                  <tr key={x._id}>
                    <td className="cell-main">{x._id}</td>
                    <td className="num">{x.qty}</td>
                    <td className="num">{fmtMoney(x.revenue)}</td>
                    {canViewCost && <td className={`num${x.revenue - x.cost < 0 ? ' text-warn' : ''}`}>{fmtMoney(x.revenue - x.cost)}</td>}
                    <td className="num"><span className="rp-share"><span style={{ width: `${share}%` }} /></span>{share}%</td>
                    <td className="num">{fmtDateTime(x.last)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th>{r.total}</th>
                <th className="num">{total.qty}</th>
                <th className="num">{fmtMoney(total.revenue)}</th>
                {canViewCost && <th className="num">{fmtMoney(total.revenue - total.cost)}</th>}
                <th className="num">100%</th>
                <th />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
