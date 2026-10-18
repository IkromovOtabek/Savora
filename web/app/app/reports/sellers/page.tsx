import { getTenantSession } from '@/lib/tenantSession';
import { branchAggMatch } from '@/lib/branchScope';
import { userCan } from '@/lib/permissionGuard';
import { parsePeriod, periodRange } from '@/lib/period';
import { fmtMoney } from '@/lib/format';
import PeriodSeg from '@/components/tenant/PeriodSeg';
import BackLink from '@/components/ui/BackLink';
import { getDict } from '@/lib/i18n/server';
import '@/components/tenant/styles/reports.css';

export async function generateMetadata() {
  return { title: (await getDict()).shell.reports.sellersMeta };
}

type Row = { _id: string; count: number; revenue: number; paid: number; cost: number };

export default async function SellersReport({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
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
      _id: { $ifNull: ['$soldBy', '—'] },
      count: { $sum: 1 },
      revenue: { $sum: '$totalAmount' },
      paid: { $sum: '$paidAmount' },
      cost: { $sum: { $multiply: [{ $ifNull: ['$productSnapshot.purchasePrice', 0] }, { $ifNull: ['$productSnapshot.saleQuantity', 1] }] } },
    } },
    { $sort: { revenue: -1 } },
  ]);
  const total = rows.reduce((a, x) => ({ count: a.count + x.count, revenue: a.revenue + x.revenue, paid: a.paid + x.paid, cost: a.cost + x.cost }), { count: 0, revenue: 0, paid: 0, cost: 0 });

  return (
    <>
      <BackLink href="/app/reports" className="btn btn-plain btn-sm">{r.back}</BackLink>
      <div className="t-page-head">
        <div><h1 className="t-page-title">{r.sellersTitle}</h1></div>
        <PeriodSeg basePath="/app/reports/sellers" current={period} />
      </div>
      {rows.length === 0 ? (
        <div className="rp-empty">{r.empty}</div>
      ) : (
        <div className="table-wrap rp-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{r.colSeller}</th>
                <th className="num">{r.colCount}</th>
                <th className="num">{r.colRevenue}</th>
                <th className="num">{r.colPaid}</th>
                <th className="num">{r.colAvg}</th>
                {canViewCost && <th className="num">{r.colProfit}</th>}
                <th className="num">{r.colShare}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x._id}>
                  <td className="cell-main">{x._id}</td>
                  <td className="num">{x.count}</td>
                  <td className="num">{fmtMoney(x.revenue)}</td>
                  <td className="num">{fmtMoney(x.paid)}</td>
                  <td className="num">{fmtMoney(Math.round(x.revenue / x.count))}</td>
                  {canViewCost && <td className="num">{fmtMoney(x.revenue - x.cost)}</td>}
                  <td className="num">
                    <span className="rp-share"><span style={{ width: `${total.revenue ? Math.round((x.revenue / total.revenue) * 100) : 0}%` }} /></span>
                    {total.revenue ? Math.round((x.revenue / total.revenue) * 100) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>{r.total}</th>
                <th className="num">{total.count}</th>
                <th className="num">{fmtMoney(total.revenue)}</th>
                <th className="num">{fmtMoney(total.paid)}</th>
                <th className="num">{fmtMoney(total.count ? Math.round(total.revenue / total.count) : 0)}</th>
                {canViewCost && <th className="num">{fmtMoney(total.revenue - total.cost)}</th>}
                <th className="num">100%</th>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
