import Icon from '@/components/icons/Icon';
import type { Dict } from '@/lib/i18n/dict';
import { tr } from '@/lib/i18n/fmt';
import type { DishTiming, KitchenReport } from '@/lib/restaurant/reports';
import type { DurationStats } from '@/lib/restaurant/timings';
import { DurBar, Empty, Panel, Section, durFmt } from './ui';

const SLOW = 10;

/** 2-talab: tayyorlanish (yuborildi → tayyor) va yetkazish (tayyor → yetkazildi) vaqtlari */
export default function KitchenSection({ k, d }: { k: KitchenReport; d: Dict }) {
  const t = d.restaurant.reports;
  const dur = durFmt(d);
  const kinds = d.restaurant.common.stationKinds;

  if (k.prep.count === 0 && k.delivery.count === 0) {
    return (
      <Section id="kitchen" title={t.prepTime} sub={t.kitchenSub}>
        <div className="fn-panel"><Empty icon="clock" text={t.kitchenEmpty} /></div>
      </Section>
    );
  }

  const stat = (icon: 'clock' | 'utensils', label: string, s: DurationStats) => (
    <div className="rr-stat">
      <span className="rr-stat-l"><span className="ux-clay"><Icon name={icon} size={16} /></span> {label}</span>
      <div className="rr-stat-grid">
        <div><span>{t.colAvg}</span><b>{dur(s.avgMs)}</b></div>
        <div><span>{t.colMedian}</span><b>{dur(s.medianMs)}</b></div>
        <div><span title={t.p90Hint}>{t.colP90}</span><b>{dur(s.p90Ms)}</b></div>
        <div><span>{t.colCount}</span><b>{s.count}</b></div>
      </div>
    </div>
  );

  const slow = k.dishes.slice(0, SLOW);
  const rest = k.dishes.slice(SLOW);
  const scale = Math.max(1, ...k.dishes.map((x) => x.prep.p90Ms ?? x.prep.avgMs ?? 0));
  const dishRows = (list: DishTiming[], offset: number) =>
    list.map((x, i) => (
      <tr key={x.productId}>
        <td data-label={t.colDish}><span className="cell-main"><span className="rr-rank" aria-hidden="true">{offset + i + 1}</span>{x.name}</span></td>
        <td data-label={t.colCount} className="num">{x.prep.count}</td>
        <td data-label={t.colAvg} className="num"><b>{dur(x.prep.avgMs)}</b></td>
        <td data-label={t.colP90} className="num">{dur(x.prep.p90Ms)}</td>
        <td data-label="" className="rr-bar-cell"><DurBar avg={x.prep.avgMs} p90={x.prep.p90Ms} max={scale} /></td>
      </tr>
    ));
  const dishHead = (
    <thead>
      <tr>
        <th>{t.colDish}</th>
        <th className="num">{t.colCount}</th>
        <th className="num">{t.colAvg}</th>
        <th className="num" title={t.p90Hint}>{t.colP90}</th>
        <th aria-hidden="true" />
      </tr>
    </thead>
  );

  return (
    <Section id="kitchen" title={t.prepTime} sub={t.kitchenSub}>
      <div className="rr-stats">
        {stat('utensils', t.prepTime, k.prep)}
        {stat('clock', t.deliveryTime, k.delivery)}
      </div>

      <div className="rr-two">
        <Panel id="kitchen-st" title={t.byStation} sub={t.p90Hint}>
          {k.byStation.length === 0 ? (
            <Empty icon="utensils" text={t.kitchenEmpty} />
          ) : (
            <div className="table-wrap">
              <table className="data-table rr-table">
                <thead>
                  <tr>
                    <th>{t.colStation}</th>
                    <th className="num">{t.colCount}</th>
                    <th className="num">{t.colAvg}</th>
                    <th className="num">{t.colMedian}</th>
                    <th className="num" title={t.p90Hint}>{t.colP90}</th>
                    <th className="num">{t.colMax}</th>
                  </tr>
                </thead>
                <tbody>
                  {k.byStation.map((s) => (
                    <tr key={s.stationId}>
                      <td data-label={t.colStation}>
                        <span className="cell-main">
                          {s.name ?? '—'}
                          {s.kind && s.name !== kinds[s.kind] && <span className="rr-muted"> · {kinds[s.kind]}</span>}
                        </span>
                      </td>
                      <td data-label={t.colCount} className="num">{s.prep.count}</td>
                      <td data-label={t.colAvg} className="num"><b>{dur(s.prep.avgMs)}</b></td>
                      <td data-label={t.colMedian} className="num">{dur(s.prep.medianMs)}</td>
                      <td data-label={t.colP90} className="num">{dur(s.prep.p90Ms)}</td>
                      <td data-label={t.colMax} className="num">{dur(s.prep.maxMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel id="kitchen-dl" title={t.deliveryByWaiter} sub={t.deliverySub}>
          {k.deliveryByWaiter.length === 0 ? (
            <Empty icon="users" text={t.noData} />
          ) : (
            <div className="table-wrap">
              <table className="data-table rr-table">
                <thead>
                  <tr>
                    <th>{t.colWaiter}</th>
                    <th className="num">{t.colCount}</th>
                    <th className="num">{t.colAvg}</th>
                    <th className="num" title={t.p90Hint}>{t.colP90}</th>
                  </tr>
                </thead>
                <tbody>
                  {k.deliveryByWaiter.map((w) => (
                    <tr key={w.key || '-'}>
                      <td data-label={t.colWaiter}><span className="cell-main">{w.name || t.noWaiter}</span></td>
                      <td data-label={t.colCount} className="num">{w.delivery.count}</td>
                      <td data-label={t.colAvg} className="num"><b>{dur(w.delivery.avgMs)}</b></td>
                      <td data-label={t.colP90} className="num">{dur(w.delivery.p90Ms)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <Panel id="kitchen-slow" title={t.slowTitle} sub={t.slowSub}>
        {slow.length === 0 ? (
          <Empty icon="utensils" text={t.kitchenEmpty} />
        ) : (
          <>
            <div className="rr-legend" aria-hidden="true">
              <span><i /> {t.legendAvg}</span>
              <span><b /> {t.legendP90}</span>
            </div>
            <div className="table-wrap">
              <table className="data-table rr-table">
                {dishHead}
                <tbody>{dishRows(slow, 0)}</tbody>
              </table>
            </div>
            {rest.length > 0 && (
              <details className="rr-more">
                <summary>{tr(t.moreDishes, { n: rest.length })} <Icon name="chevron" size={16} /></summary>
                <div className="table-wrap">
                  <table className="data-table rr-table">
                    {dishHead}
                    <tbody>{dishRows(rest, SLOW)}</tbody>
                  </table>
                </div>
              </details>
            )}
          </>
        )}
      </Panel>
    </Section>
  );
}
