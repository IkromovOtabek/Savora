'use client';

/**
 * Oshxona ekrani kartochkalari: faol buyurtma (navbatda/tayyorlanmoqda, taymer, «Boshlash»/«Tayyor»),
 * «Tayyor» ustuni kartochkasi («Berildi», «Qaytarish»). Holat va amallar — KitchenScreen'da.
 */
import { memo } from 'react';
import { useDict } from '@/lib/i18n/client';
import { tr, qtyWithUnit } from '@/lib/i18n/fmt';
import { fmtQty } from '@/lib/qty';
import type { KdsItem, KdsOrder } from '@/lib/restaurant/queries';
import type { BumpTarget } from '@/lib/restaurant/rules';
import {
  cardTimer,
  clockHHMM,
  elapsedMinutes,
  elapsedMs,
  formatTimer,
  nextBump,
  shortOrderNo,
  timerLevel,
  toMs,
  type KdsThresholds,
} from './kdsLogic';

export interface KdsVoidedEntry {
  /** Bekor qilinganida ekrandagi buyurtma (kartochka yo'qolgan bo'lsa ham sarlavha uchun) */
  order: KdsOrder;
  item: KdsItem;
  reason: string | null;
  /** Ekranda qachon aniqlangan (server vaqti, ms) */
  at: number;
}

export interface KdsReduced { from: number; to: number; at: number }

type Dict = ReturnType<typeof useDict>;

/** Stol raqami yoki buyurtma turi («Saboy», «QR buyurtma») */
export function orderLabel(o: Pick<KdsOrder, 'tableNumber' | 'type'>, d: Dict): string {
  const c = d.restaurant.common;
  return o.tableNumber ? tr(c.tableN, { n: o.tableNumber }) : c.orderTypes[o.type];
}

function qtyText(i: Pick<KdsItem, 'qty' | 'unit'>, d: Dict): string {
  return !i.unit || i.unit === 'dona' ? `${fmtQty(i.qty)}×` : qtyWithUnit(i.qty, i.unit, d.stock.fields.units);
}

/** Modifikatorlar guruh bo'yicha: «Porsiya: Katta · Qo'shimcha: Achchiq, Piyozsiz» */
function modifiersText(mods: KdsItem['modifiers']): string {
  const groups = new Map<string, string[]>();
  for (const m of mods) groups.set(m.group, [...(groups.get(m.group) ?? []), m.name]);
  return [...groups].map(([g, names]) => (g ? `${g}: ${names.join(', ')}` : names.join(', '))).join(' · ');
}

function ItemBody({ item, d, struck }: { item: KdsItem; d: Dict; struck?: boolean }) {
  const k = d.restaurant.kitchen;
  const mods = modifiersText(item.modifiers);
  const Name = struck ? 's' : 'span';
  return (
    <>
      <div className="kds-name"><Name>{item.name}</Name></div>
      {mods && <div className="kds-mods">{mods}</div>}
      {item.note && (
        <div className="kds-note"><b>{k.note}:</b> {item.note}</div>
      )}
    </>
  );
}

/* ───────────────────────────── faol buyurtma kartochkasi ───────────────────────────── */

export interface KdsCardProps {
  order: KdsOrder;
  /** Faol taomlar (sent/cooking) — bo'sh bo'lishi mumkin (faqat bekor qilinganlar qolgan) */
  items: KdsItem[];
  voided: KdsVoidedEntry[];
  reduced: Record<string, KdsReduced>;
  /** Shu buyurtmaning «Tayyor» ustunidagi taomlari soni */
  readyCount: number;
  now: number;
  th: KdsThresholds;
  /** Stansiya nomi (faqat «Hammasi» ko'rinishida va bir nechta stansiya bo'lsa) */
  stationName: (id: string | null) => string | null;
  isNew: boolean;
  newItems: ReadonlySet<string>;
  busy: ReadonlySet<string>;
  canBump: boolean;
  onBump: (order: KdsOrder, itemIds: string[], to: BumpTarget) => void;
  onAck: (orderId: string) => void;
}

export const KdsCard = memo(function KdsCard(p: KdsCardProps) {
  const d = useDict();
  const k = d.restaurant.kitchen;
  const c = d.restaurant.common;
  const { order, items, now, th } = p;
  const timer = cardTimer(items, now, th);
  const label = orderLabel(order, d);
  const ghost = items.length === 0;
  const reducedHere = items.filter((i) => p.reduced[i.id]);
  const warn = p.voided.length > 0 || reducedHere.length > 0;
  const sentIds = items.filter((i) => i.status === 'sent').map((i) => i.id);
  const activeIds = items.map((i) => i.id);
  const anyBusy = activeIds.some((id) => p.busy.has(id));
  const titleId = `kds-o-${order.id}`;
  const level = ghost ? 'void' : timer.level;

  return (
    <article
      className={`kds-card${p.isNew ? ' kds-card--new' : ''}${warn ? ' kds-card--warn' : ''}`}
      data-level={level}
      aria-labelledby={titleId}
    >
      <header className="kds-card-head">
        <div className="kds-card-title">
          <h3 id={titleId} className="kds-label">{label}</h3>
          {p.isNew && <span className="kds-badge kds-badge--new">{k.newBadge}</span>}
          {order.source === 'qr' && <span className="kds-badge kds-badge--qr" title={k.qrOrderHint}>{k.qrBadge}</span>}
        </div>
        {!ghost && (
          <div
            className="kds-timer tnum"
            role="timer"
            aria-label={tr(k.timerAria, { n: elapsedMinutes(timer.elapsed) })}
          >
            {formatTimer(timer.elapsed)}
          </div>
        )}
        <p className="kds-meta">
          <b>{tr(k.orderNo, { no: shortOrderNo(order.orderNo) })}</b>
          {order.waiterName && <span>{order.waiterName}</span>}
          {timer.startMs !== null && <span>{tr(k.sentAt, { time: clockHHMM(timer.startMs) })}</span>}
          {order.guests ? <span>{tr(k.guestsN, { n: order.guests })}</span> : null}
          {order.tableNumber && order.type !== 'dine_in' ? <span>{c.orderTypes[order.type]}</span> : null}
        </p>
        {order.note && <p className="kds-onote"><b>{k.orderNote}:</b> {order.note}</p>}
      </header>

      {warn && (
        <div className="kds-alert" role="alert">
          <span className="kds-alert-ic" aria-hidden="true">!</span>
          <b>{p.voided.length ? k.voidedWarn : k.reducedWarn}</b>
          <button type="button" className="kds-btn kds-btn--ack" onClick={() => p.onAck(order.id)}>{k.ack}</button>
        </div>
      )}

      <ul className="kds-items">
        {items.map((i) => {
          const to = nextBump(i.status);
          const own = elapsedMs(i.sentAt, now);
          const later = timer.startMs !== null && (toMs(i.sentAt) ?? 0) - timer.startMs >= 60_000;
          const station = p.stationName(i.stationId);
          const red = p.reduced[i.id];
          const busy = p.busy.has(i.id);
          return (
            <li
              key={i.id}
              className={`kds-item${p.newItems.has(i.id) ? ' kds-item--new' : ''}`}
              data-status={i.status}
            >
              <span className="kds-qty tnum">{qtyText(i, d)}</span>
              <div className="kds-item-main">
                <ItemBody item={i} d={d} />
                {red && <div className="kds-reduced" role="note">{tr(k.qtyReduced, { from: fmtQty(red.from), to: fmtQty(red.to) })}</div>}
                <div className="kds-item-meta">
                  <span className="kds-st">{i.status === 'sent' ? k.waiting : k.cooking}</span>
                  {p.newItems.has(i.id) && !p.isNew && <span className="kds-badge kds-badge--new">{k.addedBadge}</span>}
                  {i.fromQr && order.source !== 'qr' && <span className="kds-tag kds-tag--qr" title={k.qrOrderHint}>{k.qrBadge}</span>}
                  {station && <span className="kds-tag">{station}</span>}
                  {later && <span className="kds-mini tnum" data-level={timerLevel(own, th)}>{tr(c.minutes, { n: elapsedMinutes(own) })}</span>}
                </div>
              </div>
              {p.canBump && to && (
                <button
                  type="button"
                  className={`kds-btn kds-ibtn kds-btn--${to}`}
                  disabled={busy}
                  aria-busy={busy || undefined}
                  aria-label={`${to === 'cooking' ? k.start : k.ready}: ${i.name}`}
                  onClick={() => p.onBump(order, [i.id], to)}
                >
                  {to === 'cooking' ? k.start : k.ready}
                </button>
              )}
            </li>
          );
        })}
        {p.voided.map((v) => (
          <li key={`v-${v.item.id}`} className="kds-item kds-item--void" data-status="voided">
            <span className="kds-qty tnum"><s>{qtyText(v.item, d)}</s></span>
            <div className="kds-item-main">
              <ItemBody item={v.item} d={d} struck />
              <div className="kds-item-meta">
                <span className="kds-st kds-st--void">{k.voidedBadge}</span>
                {v.reason && <span className="kds-void-reason">{tr(k.voidReason, { reason: v.reason })}</span>}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {p.canBump && !ghost && (
        <footer className="kds-card-foot">
          {sentIds.length > 0 && (
            <button
              type="button"
              className="kds-btn kds-btn--cooking"
              disabled={anyBusy}
              onClick={() => p.onBump(order, sentIds, 'cooking')}
            >
              {k.startAll}
            </button>
          )}
          <button
            type="button"
            className="kds-btn kds-btn--ready"
            disabled={anyBusy}
            onClick={() => p.onBump(order, activeIds, 'ready')}
          >
            {k.readyAll}
          </button>
        </footer>
      )}
      {p.readyCount > 0 && !ghost && (
        <p className="kds-card-note">{k.readyCol}: {p.readyCount}</p>
      )}
    </article>
  );
});

/* ───────────────────────────── «Tayyor» ustuni kartochkasi ───────────────────────────── */

export interface KdsReadyCardProps {
  order: KdsOrder;
  items: KdsItem[];
  firstReadyMs: number | null;
  now: number;
  busy: ReadonlySet<string>;
  canBump: boolean;
  /** «Berildi» ikkinchi bosishni kutyapti (qaytarib bo'lmaydigan amal) */
  confirming: boolean;
  onServe: (order: KdsOrder, itemIds: string[]) => void;
  onRecall: (order: KdsOrder, itemId: string) => void;
}

export const KdsReadyCard = memo(function KdsReadyCard(p: KdsReadyCardProps) {
  const d = useDict();
  const k = d.restaurant.kitchen;
  const { order, items } = p;
  const waitedMin = p.firstReadyMs === null ? 0 : elapsedMinutes(p.now - p.firstReadyMs);
  const ids = items.map((i) => i.id);
  const anyBusy = ids.some((id) => p.busy.has(id));
  return (
    <article className="kds-rcard" aria-label={`${orderLabel(order, d)} — ${k.readyCol}`}>
      <header className="kds-rcard-head">
        <h3 className="kds-rlabel">{orderLabel(order, d)}</h3>
        {order.source === 'qr' && <span className="kds-badge kds-badge--qr" title={k.qrOrderHint}>{k.qrBadge}</span>}
        <span className="kds-rno">{tr(k.orderNo, { no: shortOrderNo(order.orderNo) })}</span>
        <span className="kds-rago">{waitedMin < 1 ? k.readyNow : tr(k.readyAgo, { n: waitedMin })}</span>
      </header>
      <ul className="kds-ritems">
        {items.map((i) => (
          <li key={i.id} className="kds-ritem">
            <span className="kds-qty tnum">{qtyText(i, d)}</span>
            <span className="kds-rname">{i.displayName}</span>
            {p.canBump && (
              <button
                type="button"
                className="kds-btn kds-btn--recall"
                disabled={p.busy.has(i.id)}
                aria-label={`${k.recall}: ${i.name}`}
                onClick={() => p.onRecall(order, i.id)}
              >
                {k.recall}
              </button>
            )}
          </li>
        ))}
      </ul>
      {p.canBump && (
        <button
          type="button"
          className={`kds-btn kds-btn--served${p.confirming ? ' is-confirm' : ''}`}
          disabled={anyBusy}
          onClick={() => p.onServe(order, ids)}
        >
          {p.confirming ? k.confirmTap : k.served}
        </button>
      )}
    </article>
  );
});
