import type { Dict } from '@/lib/i18n/dict';
import { tr } from '@/lib/i18n/fmt';
import { fmtMoney } from '@/lib/format';
import { waiterTable, type SalesReport, type SalesTotals, type VoidReport } from '@/lib/restaurant/reports';
import { Empty, Panel, Section, durFmt, fmtNum } from './ui';

/**
 * 3-talab: «Ofitsantlar» jadvali — davrda yopilgan buyurtmalar bo'yicha KPI + ofitsant stollarida (oshxonaga yuborilgandan
 * keyin) bekor qilingan taomlar (`waiterTable`, docs/RESTORAN_API.md §17). Ism — login emas (lib/staffNames).
 */
export default function StaffSection({ s, v, d }: { s: SalesReport; v: VoidReport; d: Dict }) {
  const t = d.restaurant.reports;
  const w = d.waiterDay.report;
  const dur = durFmt(d);
  const share = (x: number) => (s.totals.revenue > 0 ? Math.round((x / s.totals.revenue) * 100) : 0);
  const avgGuests = (k: SalesTotals) => (k.avgGuests != null ? fmtNum(k.avgGuests) : '—');
  const rows = waiterTable(s.byWaiter, v.rows);
  // Bitta element — telefondagi kartochka ko'rinishida (data-label) qator bo'linmasin
  const voidCell = (n: number, loss: number) => (
    n === 0 ? '—' : (
      <span className="rr-nowrap">
        {n}
        {loss > 0 && <span className="rr-loss" title={tr(w.lossTitle, { n: loss })}> · {loss}</span>}
      </span>
    )
  );

  return (
    <Section id="staff" title={t.staffTitle} sub={t.staffSub}>
      <Panel id="staff-kpi" title={w.title} sub={w.sub}>
        {rows.length === 0 ? (
          <Empty icon="users" text={t.staffEmpty} />
        ) : (
          <div className="table-wrap">
            <table className="data-table rr-table">
              <thead>
                <tr>
                  <th>{t.colWaiter}</th>
                  <th className="num">{t.colOrders}</th>
                  <th className="num">{t.colRevenue}</th>
                  <th className="num">{t.colAvgCheck}</th>
                  <th className="num">{t.colGuests}</th>
                  <th className="num">{t.colAvgGuests}</th>
                  <th className="num">{t.colService}</th>
                  <th className="num" title={t.serviceTimeHint}>{t.colServiceTime}</th>
                  <th className="num" title={w.sub}>{w.colVoids}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.key || '-'}>
                    <td data-label={t.colWaiter}>
                      <span className="cell-main">{x.name || t.noWaiter}<span className="rr-muted"> · {share(x.revenue)}%</span></span>
                    </td>
                    <td data-label={t.colOrders} className="num">{x.orders}</td>
                    <td data-label={t.colRevenue} className="num"><b>{fmtMoney(x.revenue)}</b></td>
                    <td data-label={t.colAvgCheck} className="num">{fmtMoney(x.avgCheck)}</td>
                    <td data-label={t.colGuests} className="num">{x.guests || '—'}</td>
                    <td data-label={t.colAvgGuests} className="num">{avgGuests(x)}</td>
                    <td data-label={t.colService} className="num">{fmtMoney(x.serviceCharge)}</td>
                    <td data-label={t.colServiceTime} className="num">{dur(x.avgServiceMs)}</td>
                    <td data-label={w.colVoids} className="num" title={x.voids ? `${w.colVoidAmount}: ${fmtMoney(x.voidAmount)}` : undefined}>
                      {voidCell(x.voids, x.lossCount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 1 && (
                <tfoot>
                  <tr>
                    <th>{t.total}</th>
                    <th data-label={t.colOrders} className="num">{s.totals.orders}</th>
                    <th data-label={t.colRevenue} className="num">{fmtMoney(s.totals.revenue)}</th>
                    <th data-label={t.colAvgCheck} className="num">{fmtMoney(s.totals.avgCheck)}</th>
                    <th data-label={t.colGuests} className="num">{s.totals.guests || '—'}</th>
                    <th data-label={t.colAvgGuests} className="num">{avgGuests(s.totals)}</th>
                    <th data-label={t.colService} className="num">{fmtMoney(s.totals.serviceCharge)}</th>
                    <th data-label={t.colServiceTime} className="num">{dur(s.totals.avgServiceMs)}</th>
                    <th data-label={w.colVoids} className="num">{voidCell(v.totals.count, v.totals.lossCount)}</th>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Panel>
    </Section>
  );
}
