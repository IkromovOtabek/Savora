import Link from 'next/link';
import Icon, { type IconName } from '@/components/icons/Icon';
import type { Dict } from '@/lib/i18n/dict';
import { tr } from '@/lib/i18n/fmt';
import { fmtMoney } from '@/lib/format';
import { TASHKENT_OFFSET_MS } from '@/lib/period';
import { WAITER_DAY_PERIODS, type WaiterDay } from '@/lib/restaurant/waiterDay';
import type { OrderSummary } from '@/lib/restaurant/view';
import WaiterDayRefresh from './WaiterDayRefresh';
import './waiterDay.css';

export const WAITER_DAY_PATH = '/app/tables/me';

const pad = (n: number) => String(n).padStart(2, '0');
/** Toshkent vaqti (davr chegaralari ham shu bo'yicha): «14:05» */
export function tkClock(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(new Date(iso).getTime() + TASHKENT_OFFSET_MS);
  return Number.isNaN(t.getTime()) ? '—' : `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}
/** «20.11» — YYYY-MM-DD kalitdan */
const dayShort = (key: string) => `${key.slice(8, 10)}.${key.slice(5, 7)}`;
/** «20.11 14:05» (Toshkent) */
function tkDayClock(iso: string | null): string {
  if (!iso) return '—';
  const t = new Date(new Date(iso).getTime() + TASHKENT_OFFSET_MS);
  return `${pad(t.getUTCDate())}.${pad(t.getUTCMonth() + 1)} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

function Kpi({ icon, tone, label, value, unit, sub, accent }: {
  icon: IconName; tone: string; label: string; value: string;
  /** Pul birligi («so'm») — karta pul ko'rsatkichi (tor ekranda shrift kichrayadi) */
  unit?: string;
  sub?: string;
  accent?: 'bad';
}) {
  return (
    <div className={`wd-kpi${unit ? ' wd-kpi--money' : ''}${accent ? ` wd-kpi--${accent}` : ''}`}>
      <span className="wd-kpi-l"><span className={`ux-clay ${tone}`}><Icon name={icon} size={15} /></span>{label}</span>
      <span className="wd-kpi-v">{value}{unit && <small>{unit}</small>}</span>
      {sub && <span className="wd-kpi-s">{sub}</span>}
    </div>
  );
}

function OpenCard({ o, d }: { o: OrderSummary; d: Dict }) {
  const t = d.waiterDay;
  const c = d.restaurant.common;
  const n = o.counts;
  const title = o.tableNumber != null ? tr(c.tableN, { n: o.tableNumber }) : t.takeaway;
  return (
    <li>
      <Link href={`/app/tables/${o.id}`} className={`wd-open-card${n && n.ready > 0 ? ' is-ready' : ''}`}>
        <span className="wd-open-top">
          <b className="wd-open-t">{title}</b>
          <span className="wd-open-no">{o.orderNo}</span>
        </span>
        <span className="wd-badges">
          {n && n.ready > 0 && <span className="wd-badge wd-badge--ok"><Icon name="check" size={13} />{tr(t.ready, { n: n.ready })}</span>}
          {n && n.pending > 0 && <span className="wd-badge wd-badge--warn"><Icon name="qr" size={13} />{tr(t.pending, { n: n.pending })}</span>}
          {n && n.unsent > 0 && <span className="wd-badge">{tr(t.unsent, { n: n.unsent })}</span>}
          {o.status === 'precheck' && <span className="wd-badge wd-badge--info">{t.precheck}</span>}
        </span>
        <span className="wd-open-bottom">
          <span className="wd-open-meta">
            {[o.guests ? tr(t.guestsN, { n: o.guests }) : '', tr(t.openedAt, { t: tkClock(o.openedAt) })].filter(Boolean).join(' · ')}
          </span>
          {o.due != null && (
            <span className="wd-open-due">
              <small>{t.due}</small>
              <b>{fmtMoney(o.due)}</b>
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

/**
 * «Mening kunim» ko'rinishi (server komponent): davr, 6 ta katta ko'rsatkich, ochiq stollarim (buyurtma ekraniga havola),
 * yopilgan hisoblarim. Ma'lumot — lib/restaurant/waiterDay.ts. Vaqtlar — Toshkent bo'yicha (davr chegaralari bilan bir xil).
 */
export default function WaiterDayView({ data, d }: { data: WaiterDay; d: Dict }) {
  const t = d.waiterDay;
  const c = d.restaurant.common;
  const k = data.totals;
  const sum = d.common.sum;
  const multiDay = data.fromDay !== data.toDay;
  const rangeText = multiDay ? tr(t.range, { from: dayShort(data.fromDay), to: dayShort(data.toDay) }) : `${dayShort(data.toDay)}.${data.toDay.slice(0, 4)}`;
  const place = (b: { tableNumber: number | null }) => (b.tableNumber != null ? tr(c.tableN, { n: b.tableNumber }) : t.takeaway);

  return (
    <div className="wd-page">
      <div className="t-page-head wd-head">
        <div>
          <h1 className="t-page-title">{t.title}</h1>
          <p className="t-page-sub">{tr(t.sub, { name: data.name })}</p>
        </div>
        <WaiterDayRefresh label={t.refresh} updatedLabel={tr(t.updated, { t: tkClock(data.serverTime) })} />
      </div>

      <div className="wd-period">
        <nav className="t-period-seg" aria-label={t.periodAria}>
          {WAITER_DAY_PERIODS.map((p) => (
            <Link key={p} href={p === 'today' ? WAITER_DAY_PATH : `${WAITER_DAY_PATH}?p=${p}`} scroll={false} aria-current={data.period === p ? 'page' : undefined}>
              {t.periods[p]}
            </Link>
          ))}
        </nav>
        <span className="wd-range">{rangeText}</span>
      </div>

      <section className="wd-kpis" aria-label={t.kpiAria}>
        <Kpi icon="clipboard" tone="" label={t.kpi.orders} value={String(k.orders)} />
        <Kpi icon="wallet" tone="ux-clay--green" label={t.kpi.revenue} value={fmtMoney(k.revenue)} unit={sum} sub={t.revenueNote} />
        <Kpi icon="cart" tone="" label={t.kpi.avgCheck} value={fmtMoney(k.avgCheck)} unit={sum} />
        <Kpi
          icon="users" tone="" label={t.kpi.guests} value={String(k.guests)}
          sub={k.guestsMissing > 0 ? tr(t.guestsMissing, { n: k.guestsMissing }) : undefined}
        />
        <Kpi icon="sparkles" tone="ux-clay--gold" label={t.kpi.serviceCharge} value={fmtMoney(k.serviceCharge)} unit={sum} />
        <Kpi
          icon="alert" tone={k.voids ? 'ux-clay--red' : 'ux-clay--gray'} label={t.kpi.voids} value={String(k.voids)}
          sub={k.voids ? (k.lossCount ? tr(t.voidsLoss, { n: k.lossCount }) : `${fmtMoney(k.voidAmount)} ${sum}`) : t.voidsNone}
          accent={k.lossCount ? 'bad' : undefined}
        />
      </section>

      <section className="wd-sec" aria-labelledby="wd-open-h">
        <div className="wd-sec-head">
          <h2 id="wd-open-h">{t.openTitle}</h2>
          {data.open.length > 0 && <span className="wd-count">{tr(t.openCount, { n: data.open.length })}</span>}
        </div>
        {data.open.length === 0 ? (
          <div className="ux-empty wd-empty">
            <span className="ux-empty-ic"><Icon name="grid" size={24} /></span>
            <p>{t.openEmpty}</p>
            <Link href="/app/tables" className="btn btn-tinted btn-sm">{d.shell.nav.links['/app/tables']}</Link>
          </div>
        ) : (
          <>
            <ul className="wd-open" role="list">
              {data.open.map((o) => <OpenCard key={o.id} o={o} d={d} />)}
            </ul>
            <p className="wd-foot">{t.openHint}</p>
          </>
        )}
      </section>

      <section className="wd-sec" aria-labelledby="wd-closed-h">
        <div className="wd-sec-head">
          <h2 id="wd-closed-h">{t.closedTitle}</h2>
          {k.orders > 0 && <span className="wd-count">{k.orders}</span>}
        </div>
        {data.closed.length === 0 ? (
          <div className="ux-empty wd-empty">
            <span className="ux-empty-ic"><Icon name="clock" size={24} /></span>
            <p>{t.closedEmpty}</p>
          </div>
        ) : (
          <div className="fn-panel wd-closed">
            <ul role="list">
              {data.closed.map((b) => (
                <li key={b.id} className="wd-bill">
                  <span className="wd-bill-time">{multiDay ? tkDayClock(b.paidAt) : tkClock(b.paidAt)}</span>
                  <span className="wd-bill-place">
                    <b>{place(b)}</b>
                    <small>{[b.orderNo, b.guests ? tr(t.guestsN, { n: b.guests }) : ''].filter(Boolean).join(' · ')}</small>
                  </span>
                  <span className="wd-bill-sum">{fmtMoney(b.total)}</span>
                </li>
              ))}
            </ul>
            {k.orders > data.closed.length && <p className="wd-foot">{tr(t.closedShown, { n: data.closed.length, total: k.orders })}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
