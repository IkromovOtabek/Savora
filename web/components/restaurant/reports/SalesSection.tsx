import type { Dict } from '@/lib/i18n/dict';
import { tr } from '@/lib/i18n/fmt';
import { fmtMoney } from '@/lib/format';
import type { HourRow, SalesReport } from '@/lib/restaurant/reports';
import { Empty, Panel, Section, fmtNum } from './ui';

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** Soatlik yuklama: birinchi va oxirgi band soat oralig'i (kamida 6 soat), bitta rang; eng band soat to'q */
function HourlyChart({ hours, d }: { hours: HourRow[]; d: Dict }) {
  const t = d.restaurant.reports;
  const busy = hours.filter((h) => h.orders > 0);
  if (!busy.length) return <Empty icon="chart" text={t.salesEmpty} />;
  let lo = busy[0].hour;
  let hi = busy[busy.length - 1].hour;
  while (hi - lo < 5) { if (lo > 0) lo -= 1; if (hi - lo < 5 && hi < 23) hi += 1; }
  const list = hours.slice(lo, hi + 1);
  const max = Math.max(...list.map((h) => h.orders));
  const peak = list.reduce((a, b) => (b.orders > a.orders ? b : a));
  const step = list.length > 16 ? 3 : list.length > 10 ? 2 : 1;
  return (
    <div className="rr-hours-wrap">
      <ol className="rr-hours" style={{ ['--rr-n' as string]: list.length }} aria-label={`${t.hourlyTitle}. ${tr(t.peak, { h: hh(peak.hour) })}`}>
        {list.map((h) => {
          const label = tr(t.hourBar, { h: hh(h.hour), n: h.orders, sum: fmtMoney(h.revenue) });
          return (
            <li key={h.hour} className={`rr-hour${h.hour === peak.hour ? ' is-peak' : ''}${h.orders === 0 ? ' is-zero' : ''}`}>
              <span className="rr-hour-bar" style={{ height: `${h.orders ? Math.max(3, (h.orders / max) * 100) : 0}%` }} aria-hidden="true" />
              <span className="rr-hour-tip" aria-hidden="true">{hh(h.hour)} · {h.orders}</span>
              <span className="sr-only">{label}</span>
            </li>
          );
        })}
      </ol>
      <div className="rr-hour-axis" style={{ ['--rr-n' as string]: list.length }} aria-hidden="true">
        {list.map((h, i) => <span key={h.hour}>{i % step === 0 ? String(h.hour).padStart(2, '0') : ''}</span>)}
      </div>
    </div>
  );
}

/** 5-talab: zal / saboy / QR bo'yicha tushum, eng ko'p sotilgan taomlar, soatlik yuklama */
export default function SalesSection({ s, d }: { s: SalesReport; d: Dict }) {
  const t = d.restaurant.reports;
  const types = d.restaurant.common.orderTypes;
  const peak = s.hourly.reduce((a, b) => (b.orders > a.orders ? b : a), s.hourly[0]);
  const maxQty = Math.max(1, ...s.topDishes.map((x) => x.qty));

  if (s.totals.orders === 0) {
    return (
      <Section id="sales" title={t.salesTitle} sub={t.salesSub}>
        <div className="fn-panel"><Empty icon="chart" text={t.salesEmpty} /></div>
      </Section>
    );
  }

  return (
    <Section id="sales" title={t.salesTitle} sub={t.salesSub}>
      <div className="rr-two">
        <Panel id="sales-ch" title={t.channelTitle} aside={`${fmtMoney(s.totals.revenue)} ${d.common.sum}`}>
          <ul className="rr-channels">
            {s.byChannel.map((c) => (
              <li key={c.type} className="rr-channel">
                <span className="rr-channel-name">{types[c.type]}<small>{c.orders}</small></span>
                <span className="rr-channel-sum">{fmtMoney(c.revenue)}</span>
                <span className="rr-channel-bar">
                  <span className="rp-share" aria-hidden="true"><span style={{ width: `${c.share}%` }} /></span>
                  <span>{c.share}%</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel id="sales-hr" title={t.hourlyTitle} sub={t.hourlySub} aside={peak && peak.orders > 0 ? tr(t.peak, { h: hh(peak.hour) }) : undefined}>
          <HourlyChart hours={s.hourly} d={d} />
        </Panel>
      </div>

      <Panel id="sales-top" title={t.topTitle}>
        {s.topDishes.length === 0 ? (
          <Empty icon="utensils" text={t.salesEmpty} />
        ) : (
          <div className="table-wrap">
            <table className="data-table rr-table">
              <thead>
                <tr>
                  <th>{t.colDish}</th>
                  <th className="num">{t.colSold}</th>
                  <th className="num">{t.colRevenue}</th>
                  <th aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {s.topDishes.map((x, i) => (
                  <tr key={x.productId}>
                    <td data-label={t.colDish}><span className="cell-main"><span className="rr-rank" aria-hidden="true">{i + 1}</span>{x.name}</span></td>
                    <td data-label={t.colSold} className="num"><b>{fmtNum(x.qty, 3)}</b></td>
                    <td data-label={t.colRevenue} className="num">{fmtMoney(x.revenue)}</td>
                    <td data-label="" className="rr-bar-cell">
                      <span className="rp-share" aria-hidden="true"><span style={{ width: `${Math.round((x.qty / maxQty) * 100)}%` }} /></span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </Section>
  );
}
