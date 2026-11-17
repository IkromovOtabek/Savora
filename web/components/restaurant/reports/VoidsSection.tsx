import Icon from '@/components/icons/Icon';
import type { Dict } from '@/lib/i18n/dict';
import { tr } from '@/lib/i18n/fmt';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import type { VoidReport } from '@/lib/restaurant/reports';
import { Empty, Panel, Section, fmtNum } from './ui';

/** Sahifada ko'rsatiladigan qatorlar (to'liq ro'yxat — CSV) */
const SHOWN = 100;

/** 4-talab: bekor qilinganlar — kim, qachon, taom, summa, sabab, holat; pishgandan keyingilari (yo'qotish) ajratilgan */
export default function VoidsSection({ v, d, maxRows }: { v: VoidReport; d: Dict; maxRows: number }) {
  const t = d.restaurant.reports;
  const c = d.restaurant.common;

  if (v.totals.count === 0) {
    return (
      <Section id="voids" title={t.voidsTitle} sub={t.voidsSub}>
        <div className="fn-panel"><Empty icon="check" text={t.voidsEmpty} /></div>
      </Section>
    );
  }

  const rows = v.rows.slice(0, SHOWN);
  return (
    <Section id="voids" title={t.voidsTitle} sub={t.voidsSub}>
      {v.truncated && <div className="t-note t-note--warn">{tr(t.truncated, { n: maxRows })}</div>}

      <div className="rr-stats">
        <div className="rr-stat">
          <span className="rr-stat-l"><span className="ux-clay ux-clay--gray"><Icon name="close" size={16} /></span> {t.voidCount}</span>
          <div className="rr-stat-grid">
            <div><span>{t.colCount}</span><b>{v.totals.count}</b></div>
            <div><span>{t.voidAmount}</span><b>{fmtMoney(v.totals.amount)}</b></div>
          </div>
        </div>
        <div className="rr-stat">
          <span className="rr-stat-l"><span className="ux-clay ux-clay--red"><Icon name="alert" size={16} /></span> {t.lossCount}</span>
          <div className="rr-stat-grid">
            <div><span>{t.colCount}</span><b className={v.totals.lossCount ? 'rr-loss' : undefined}>{v.totals.lossCount}</b></div>
            <div><span>{t.lossAmount}</span><b className={v.totals.lossAmount ? 'rr-loss' : undefined}>{fmtMoney(v.totals.lossAmount)}</b></div>
          </div>
        </div>
      </div>
      {v.totals.lossCount > 0 && <div className="t-note t-note--warn">{t.lossNote}</div>}

      <Panel id="voids-staff" title={t.byStaffTitle}>
        <div className="table-wrap">
          <table className="data-table rr-table">
            <thead>
              <tr>
                <th>{t.colStaff}</th>
                <th className="num">{t.voidCount}</th>
                <th className="num">{t.voidAmount}</th>
                <th className="num">{t.lossCount}</th>
                <th className="num">{t.lossAmount}</th>
              </tr>
            </thead>
            <tbody>
              {v.byStaff.map((s) => (
                <tr key={s.name}>
                  <td data-label={t.colStaff}><span className="cell-main">{s.name}</span></td>
                  <td data-label={t.voidCount} className="num">{s.count}</td>
                  <td data-label={t.voidAmount} className="num">{fmtMoney(s.amount)}</td>
                  <td data-label={t.lossCount} className="num">{s.lossCount ? <span className="rr-loss">{s.lossCount}</span> : 0}</td>
                  <td data-label={t.lossAmount} className="num">{s.lossAmount ? <span className="rr-loss">{fmtMoney(s.lossAmount)}</span> : 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel id="voids-list" title={t.listTitle} aside={v.totals.count}>
        <div className="table-wrap">
          <table className="data-table rr-table">
            <thead>
              <tr>
                <th>{t.colDish}</th>
                <th>{t.colWhen}</th>
                <th>{t.colWho}</th>
                <th>{t.colOrder}</th>
                <th className="num">{t.colAmount}</th>
                <th>{t.colStage}</th>
                <th>{t.colReason}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.orderId}-${r.voidedAt}-${i}`} className={r.loss ? 'rr-row-loss' : undefined}>
                  <td data-label={t.colDish}>
                    <span className="cell-main">{r.name}<span className="rr-muted"> × {fmtNum(r.qty, 3)}</span></span>
                  </td>
                  <td data-label={t.colWhen} className="cell-sub">{fmtDateTime(r.voidedAt)}</td>
                  <td data-label={t.colWho}>{r.voidedBy}</td>
                  <td data-label={t.colOrder} className="cell-sub rr-wide">
                    {r.orderNo} · {r.tableNumber != null ? tr(c.tableN, { n: r.tableNumber }) : c.orderTypes[r.type]}
                    {r.waiterName && <> · {r.waiterName}</>}
                  </td>
                  <td data-label={t.colAmount} className="num"><b>{fmtMoney(r.amount)}</b></td>
                  <td data-label={t.colStage}>
                    <span className={`rr-stage${r.loss ? ' rr-stage--loss' : ''}`}>
                      {r.loss && <Icon name="alert" size={13} />}
                      {r.loss ? t.stageAfter : t.stageBefore}
                    </span>
                  </td>
                  <td data-label={t.colReason} className="rr-wide">{r.reason || <span className="rr-muted">{t.noReason}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {v.rows.length > SHOWN && <p className="rr-foot-note">{tr(t.voidsShown, { n: SHOWN })}</p>}
      </Panel>
    </Section>
  );
}
