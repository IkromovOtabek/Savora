'use client';

import { useState } from 'react';
import Icon from '@/components/icons/Icon';
import { fmtMoney } from '@/lib/format';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { fmtQty } from '@/lib/qty';
import { voidRule } from '@/lib/restaurant/rules';
import type { OrderItemView, OrderView } from '@/lib/restaurant/view';
import { hhmm, minutesSince, msToMin } from './shared';

/** Tayyor taom shuncha daqiqadan ko'p kutsa — ogohlantirish rangi */
const READY_WARN_MIN = 5;

export type ItemAction =
  | { kind: 'serve'; ids: string[] }
  | { kind: 'confirm'; ids?: string[]; reject?: boolean; send?: boolean }
  | { kind: 'send'; ids?: string[] }
  | { kind: 'void'; item: OrderItemView };

/**
 * Buyurtma tarkibi: QR'dan kelgan (tasdiqlanmagan) taomlar, yuborilmaganlar, oshxonadagilar va
 * bekor qilinganlar. Har taomda holat va vaqtlar; bosilsa — batafsil vaqtlar va amallar.
 * Tugmalar `order.can.*` va voidRule bo'yicha (server baribir qayta tekshiradi).
 */
export default function OrderItems({ order, now, busy, requireVoidReason, onAction }: {
  order: OrderView;
  now: number;
  busy: string | null;
  requireVoidReason: boolean;
  onAction: (a: ItemAction) => void;
}) {
  const d = useDict();
  const k = d.restaurant.order;
  const can = order.can;
  const [open, setOpen] = useState<string | null>(null);
  const [showVoided, setShowVoided] = useState(false);

  const pending = order.items.filter((i) => i.status === 'pending');
  const unsent = order.items.filter((i) => i.status === 'new');
  const active = order.items.filter((i) => i.status !== 'pending' && i.status !== 'new' && i.status !== 'voided');
  const voided = order.items.filter((i) => i.status === 'voided');
  const ready = active.filter((i) => i.status === 'ready');

  const canVoid = (i: OrderItemView) => {
    const r = voidRule(i, { requireVoidReason });
    if (!r || !can) return false;
    return r.permission === 'order.voidItem' ? can.voidSent : can.voidUnsent;
  };

  const row = (i: OrderItemView) => (
    <ItemRow
      key={i.id}
      item={i}
      now={now}
      open={open === i.id}
      onToggle={() => setOpen(open === i.id ? null : i.id)}
      busy={busy}
      canServe={!!can?.serve}
      canEdit={!!can?.edit}
      canVoid={canVoid(i)}
      onAction={onAction}
    />
  );

  if (!order.items.length) {
    return <p className="rt-muted rt-none">{k.itemsEmpty}</p>;
  }

  return (
    <div className="rt-items">
      {pending.length > 0 && (
        <section className="rt-block rt-block--qr" aria-labelledby="rt-qr-t">
          <div className="rt-block-head">
            <h3 id="rt-qr-t"><Icon name="qr" size={16} />{tr(k.qrBanner, { n: pending.length })}</h3>
            {can?.edit && (
              <div className="rt-block-acts">
                <button type="button" className="btn btn-danger btn-sm" onClick={() => onAction({ kind: 'confirm', reject: true })} disabled={!!busy}>{k.rejectAll}</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => onAction({ kind: 'confirm', send: true })} disabled={!!busy}>{k.confirmSend}</button>
              </div>
            )}
          </div>
          <ul>{pending.map(row)}</ul>
        </section>
      )}

      {unsent.length > 0 && (
        <section className="rt-block rt-block--new" aria-labelledby="rt-new-t">
          <div className="rt-block-head">
            <h3 id="rt-new-t"><Icon name="clock" size={16} />{tr(k.unsentBanner, { n: unsent.length })}</h3>
            {can?.send && (
              <div className="rt-block-acts">
                <button type="button" className="btn btn-primary btn-sm btn-with-icon" onClick={() => onAction({ kind: 'send' })} disabled={!!busy}>
                  <Icon name="send" size={14} />{k.sendAll}
                </button>
              </div>
            )}
          </div>
          <ul>{unsent.map(row)}</ul>
        </section>
      )}

      {active.length > 0 && (
        <section className="rt-block" aria-labelledby="rt-act-t">
          <div className="rt-block-head">
            <h3 id="rt-act-t">{k.items} <span className="rt-count">{active.length}</span></h3>
            {ready.length > 1 && can?.serve && (
              <div className="rt-block-acts">
                <button type="button" className="btn btn-accent btn-sm btn-with-icon" onClick={() => onAction({ kind: 'serve', ids: ready.map((i) => i.id) })} disabled={!!busy}>
                  <Icon name="check" size={14} />{tr(k.serveAll, { n: ready.length })}
                </button>
              </div>
            )}
          </div>
          <ul>{active.map(row)}</ul>
        </section>
      )}

      {voided.length > 0 && (
        <section className="rt-block rt-block--void">
          <button type="button" className="rt-block-toggle" aria-expanded={showVoided} onClick={() => setShowVoided((v) => !v)}>
            <Icon name="chevron" size={16} />{tr(k.voidedN, { n: voided.length })}
          </button>
          {showVoided && <ul>{voided.map(row)}</ul>}
        </section>
      )}
    </div>
  );
}

function ItemRow({ item: i, now, open, onToggle, busy, canServe, canEdit, canVoid, onAction }: {
  item: OrderItemView;
  now: number;
  open: boolean;
  onToggle: () => void;
  busy: string | null;
  canServe: boolean;
  canEdit: boolean;
  canVoid: boolean;
  onAction: (a: ItemAction) => void;
}) {
  const d = useDict();
  const k = d.restaurant.order;
  const c = d.restaurant.common;
  const min = (n: number | null) => (n === null ? '—' : tr(c.minutes, { n }));
  const readyWait = i.status === 'ready' ? minutesSince(i.readyAt, now) : null;

  let time: string;
  switch (i.status) {
    case 'pending': time = tr(k.tAdded, { time: hhmm(i.addedAt) }); break;
    case 'new': time = tr(k.tAdded, { time: hhmm(i.addedAt) }); break;
    case 'sent': time = tr(k.tSent, { time: hhmm(i.sentAt), min: min(minutesSince(i.sentAt, now)) }); break;
    case 'cooking': time = tr(k.tCooking, { min: min(minutesSince(i.sentAt, now)) }); break;
    case 'ready': time = tr(k.tReady, { time: hhmm(i.readyAt), min: min(readyWait) }); break;
    case 'served': time = i.timings.prepMs !== null
      ? tr(k.tServed, { time: hhmm(i.servedAt), prep: min(msToMin(i.timings.prepMs)), delivery: min(msToMin(i.timings.deliveryMs)) })
      : tr(k.tServedNoStation, { time: hhmm(i.servedAt) });
      break;
    default: time = tr(k.tVoided, { time: hhmm(i.voidedAt), by: i.voidedBy ?? '—' });
  }

  const canServeThis = canServe && (i.status === 'sent' || i.status === 'cooking' || i.status === 'ready');
  const hot = readyWait !== null && readyWait >= READY_WARN_MIN;

  return (
    <li className="rt-item" data-status={i.status} data-hot={hot || undefined}>
      <div className="rt-item-row">
        <button type="button" className="rt-item-main" aria-expanded={open} onClick={onToggle}>
          <span className="rt-item-qty">{fmtQty(i.qty)}×</span>
          <span className="rt-item-name">
            <b>{i.displayName}</b>
            {i.note && <small className="rt-note">«{i.note}»</small>}
            {i.status === 'voided' && i.voidReason && <small className="rt-note">{tr(k.voidReasonShown, { reason: i.voidReason })}</small>}
            <small className="rt-item-time" suppressHydrationWarning>{time}</small>
          </span>
          <span className="rt-item-right">
            <span className="rt-st" data-status={i.status}>{c.itemStatuses[i.status]}</span>
            <span className="rt-item-sum">{fmtMoney(i.total)}</span>
            {i.paid && <span className="rt-tag rt-tag--paid">{k.paidTag}</span>}
            {i.fromQr && i.status !== 'pending' && <span className="rt-tag">QR</span>}
          </span>
        </button>
        {i.status === 'ready' && canServe && (
          <button type="button" className="btn btn-accent rt-item-quick" onClick={() => onAction({ kind: 'serve', ids: [i.id] })} disabled={!!busy}>
            <Icon name="check" size={16} />{k.served}
          </button>
        )}
        {i.status === 'pending' && canEdit && (
          <span className="rt-item-quick2">
            <button type="button" className="u-icon-btn u-icon-btn--danger" onClick={() => onAction({ kind: 'confirm', ids: [i.id], reject: true })} disabled={!!busy} aria-label={`${k.reject}: ${i.displayName}`}>
              <Icon name="close" size={16} />
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onAction({ kind: 'confirm', ids: [i.id] })} disabled={!!busy}>{k.confirm}</button>
          </span>
        )}
      </div>

      {open && (
        <div className="rt-item-more">
          <dl className="rt-times">
            <dt>{k.tlAdded}</dt><dd>{hhmm(i.addedAt) || '—'} <small>{i.addedBy}</small></dd>
            {i.sentAt && (<><dt>{k.tlSent}</dt><dd>{hhmm(i.sentAt)}</dd></>)}
            {i.cookStartedAt && (<><dt>{k.tlCooking}</dt><dd>{hhmm(i.cookStartedAt)} <small>{min(msToMin(i.timings.waitMs))}</small></dd></>)}
            {i.readyAt && i.stationId && (<><dt>{k.tlReady}</dt><dd>{hhmm(i.readyAt)} <small>{min(msToMin(i.timings.prepMs))}</small></dd></>)}
            {i.servedAt && (<><dt>{k.tlServed}</dt><dd>{hhmm(i.servedAt)} <small>{i.stationId ? min(msToMin(i.timings.deliveryMs)) : c.noStation}</small></dd></>)}
            {i.voidedAt && (<><dt>{k.tlVoided}</dt><dd>{hhmm(i.voidedAt)} <small>{i.voidedBy}{i.voidStage ? ` · ${c.voidStages[i.voidStage]}` : ''}</small></dd></>)}
            {i.stationKind && (<><dt>{c.station}</dt><dd>{c.stationKinds[i.stationKind]}</dd></>)}
            <dt>{d.common.price}</dt><dd>{fmtQty(i.qty)} × {fmtMoney(i.price)}</dd>
          </dl>
          {(canServeThis && i.status !== 'ready') || (i.status === 'new' && canEdit) || canVoid ? (
            <div className="rt-item-acts">
              {canServeThis && i.status !== 'ready' && (
                <button type="button" className="btn btn-ghost btn-sm btn-with-icon" onClick={() => onAction({ kind: 'serve', ids: [i.id] })} disabled={!!busy}>
                  <Icon name="check" size={14} />{k.served}
                </button>
              )}
              {i.status === 'new' && canEdit && (
                <button type="button" className="btn btn-ghost btn-sm btn-with-icon" onClick={() => onAction({ kind: 'send', ids: [i.id] })} disabled={!!busy}>
                  <Icon name="send" size={14} />{k.send}
                </button>
              )}
              {canVoid && (
                <button type="button" className="btn btn-danger btn-sm btn-with-icon" onClick={() => onAction({ kind: 'void', item: i })} disabled={!!busy}>
                  <Icon name="trash" size={14} />{k.void}
                </button>
              )}
            </div>
          ) : null}
        </div>
      )}
    </li>
  );
}
