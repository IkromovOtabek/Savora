import { getTenantSession } from '@/lib/tenantSession';
import { branchAggMatch } from '@/lib/branchScope';
import { userCan } from '@/lib/permissionGuard';
import { parsePeriod, periodRange } from '@/lib/period';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import PeriodSeg from '@/components/tenant/PeriodSeg';
import BackLink from '@/components/ui/BackLink';
import { getDict } from '@/lib/i18n/server';
import { qtyByUnits, qtyWithUnit } from '@/lib/i18n/fmt';
import { QTY_DECIMALS } from '@/lib/qty';
import { addQtyByUnit, type QtyByUnit } from '@/lib/unitTotals';
import '@/components/tenant/styles/reports.css';

export async function generateMetadata() {
  return { title: (await getDict()).shell.reports.productsMeta };
}

type Row = { _id: { name: string; unit: string }; qty: number; count: number; revenue: number; cost: number; last: Date };

const LIMIT = 200;
const SALE_QTY = { $ifNull: ['$productSnapshot.saleQuantity', 1] };
const SCALE = 10 ** QTY_DECIMALS;
/** priceTimesQty (lib/qty.ts) ning Mongo nusxasi: tannarx × miqdor butun arifmetikada, butun so'mga (yarmi yuqoriga) */
const LINE_COST = {
  $floor: { $divide: [
    { $add: [{ $multiply: [{ $ifNull: ['$productSnapshot.purchasePrice', 0] }, { $round: [{ $multiply: [SALE_QTY, SCALE] }, 0] }] }, SCALE / 2] },
    SCALE,
  ] },
};

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
      // Nom + birlik bo'yicha — "dona" va "kg" miqdori bir songa qo'shilmasin
      _id: { name: { $ifNull: ['$productSnapshot.name', '—'] }, unit: { $ifNull: ['$productSnapshot.unit', 'dona'] } },
      qty: { $sum: SALE_QTY },
      count: { $sum: 1 },
      revenue: { $sum: '$totalAmount' },
      cost: { $sum: LINE_COST },
      last: { $max: '$createdAt' },
    } },
    { $sort: { revenue: -1 } },
    { $limit: LIMIT },
  ]);
  const total = rows.reduce(
    (a, x) => ({ qty: addQtyByUnit(a.qty, x.qty, x._id.unit), revenue: a.revenue + x.revenue, cost: a.cost + x.cost }),
    { qty: {} as QtyByUnit, revenue: 0, cost: 0 },
  );
  const units = d.stock.fields.units;

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
                  <tr key={`${x._id.name}|${x._id.unit}`}>
                    <td className="cell-main">{x._id.name}</td>
                    <td className="num">{qtyWithUnit(x.qty, x._id.unit, units)}</td>
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
                <th className="num">{qtyByUnits(total.qty, units)}</th>
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
