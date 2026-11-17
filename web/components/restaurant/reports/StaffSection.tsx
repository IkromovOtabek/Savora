import type { Dict } from '@/lib/i18n/dict';
import { fmtMoney } from '@/lib/format';
import type { SalesReport, SalesTotals } from '@/lib/restaurant/reports';
import { Empty, Panel, Section, durFmt, fmtNum } from './ui';

/** 3-talab: ofitsant KPI — davrda yopilgan buyurtmalar bo'yicha */
export default function StaffSection({ s, d }: { s: SalesReport; d: Dict }) {
  const t = d.restaurant.reports;
  const dur = durFmt(d);
  const share = (v: number) => (s.totals.revenue > 0 ? Math.round((v / s.totals.revenue) * 100) : 0);
  const avgGuests = (k: SalesTotals) => (k.avgGuests != null ? fmtNum(k.avgGuests) : '—');

  return (
    <Section id="staff" title={t.staffTitle} sub={t.staffSub}>
      <Panel id="staff-kpi" title={t.byWaiter} sub={`${t.colServiceTime}: ${t.serviceTimeHint}`}>
        {s.byWaiter.length === 0 ? (
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
                </tr>
              </thead>
              <tbody>
                {s.byWaiter.map((w) => (
                  <tr key={w.key || '-'}>
                    <td data-label={t.colWaiter}>
                      <span className="cell-main">{w.name || t.noWaiter}<span className="rr-muted"> · {share(w.revenue)}%</span></span>
                    </td>
                    <td data-label={t.colOrders} className="num">{w.orders}</td>
                    <td data-label={t.colRevenue} className="num"><b>{fmtMoney(w.revenue)}</b></td>
                    <td data-label={t.colAvgCheck} className="num">{fmtMoney(w.avgCheck)}</td>
                    <td data-label={t.colGuests} className="num">{w.guests || '—'}</td>
                    <td data-label={t.colAvgGuests} className="num">{avgGuests(w)}</td>
                    <td data-label={t.colService} className="num">{fmtMoney(w.serviceCharge)}</td>
                    <td data-label={t.colServiceTime} className="num">{dur(w.avgServiceMs)}</td>
                  </tr>
                ))}
              </tbody>
              {s.byWaiter.length > 1 && (
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
