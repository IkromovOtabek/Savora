'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { fmtMoney } from '@/lib/format';
import { fmtQty, isFractionalUnit, parseQty, priceTimesQty } from '@/lib/qty';
import { voidRule } from '@/lib/restaurant/rules';
import { RESTAURANT_LIMITS } from '@/lib/restaurant/types';
import type { OrderItemView, OrderView } from '@/lib/restaurant/view';
import type { TablesBoard } from '@/lib/restaurant/queries';
import type { ActionResult } from '@/lib/restaurant/session';
import {
  cancelOrderAction,
  transferOrderAction,
  updateOrderInfoAction,
  voidOrderItemAction,
} from '@/app/actions/restaurant';
import Modal, { QtyStepper } from './Modal';
import { getJson } from './shared';

/** Ota komponentdagi amal ishga tushirgich: band holat, xabar, `data.order` → holat, ziddiyatda qayta o'qish */
export type Runner = <T>(tag: string, fn: () => Promise<ActionResult<T>>) => Promise<ActionResult<T> | null>;

/** Taomni bekor qilish: miqdor (qismi), sabab (yuborilgan taomda — sozlama bo'yicha majburiy), ombor oqibati */
export function VoidDialog({ order, item, requireVoidReason, busy, run, onClose }: {
  order: OrderView;
  item: OrderItemView;
  requireVoidReason: boolean;
  busy: boolean;
  run: Runner;
  onClose: () => void;
}) {
  const d = useDict();
  const k = d.restaurant.order;
  const rule = voidRule(item, { requireVoidReason });
  const fractional = isFractionalUnit(item.unit);
  const [qty, setQty] = useState(item.qty);
  const [qtyText, setQtyText] = useState(fmtQty(item.qty));
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);

  const q = fractional ? parseQty(qtyText, item.unit) : qty;
  const qtyOk = q !== null && q > 0 && q <= item.qty;
  const needReason = !!rule?.reasonRequired && !reason.trim();

  async function submit() {
    setTried(true);
    if (!rule || !qtyOk || needReason) return;
    const r = await run('void', () => voidOrderItemAction(order.id, {
      itemId: item.id,
      qty: q! < item.qty ? q! : undefined,
      reason: reason.trim() || undefined,
    }));
    if (r?.ok) onClose();
  }

  if (!rule) return null;
  const hint = rule.stage === 'unsent' ? k.voidHintUnsent : rule.stage === 'beforeCook' ? k.voidHintBeforeCook : k.voidHintAfterCook;

  return (
    <Modal
      title={k.voidTitle}
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>{d.common.back}</button>
          <button type="button" className="btn btn-danger-fill" onClick={submit} disabled={busy}>
            {busy ? d.common.loading : `${k.void} · ${fmtMoney(priceTimesQty(item.price, qtyOk ? q! : 0))}`}
          </button>
        </>
      )}
    >
      <form className="rt-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <p className="rt-void-name"><b>{item.displayName}</b><small>{d.restaurant.common.itemStatuses[item.status]}</small></p>
        <p className={`rt-hint${rule.loss ? ' rt-hint--warn' : ''}`}>{hint}</p>
        {item.qty > 1 || fractional ? (
          <>
            <span className="rt-label">{tr(k.voidQty, { n: fmtQty(item.qty) })}</span>
            <QtyStepper
              value={qty}
              onChange={(n) => { setQty(n); setQtyText(fmtQty(n)); }}
              min={1}
              max={Math.floor(item.qty) || 1}
              label={k.qty}
              decLabel={k.qtyDec}
              incLabel={k.qtyInc}
              fractional={fractional}
              text={qtyText}
              onText={(s) => { setQtyText(s); const n = parseQty(s, item.unit); if (n !== null) setQty(n); }}
            />
            {tried && !qtyOk && <p className="rt-bad" role="alert">{tr(d.restaurant.errors.badQty, { name: item.name })}</p>}
          </>
        ) : null}
        <label className="rt-label" htmlFor="rt-void-reason">
          {d.restaurant.order.voidReason} {rule.reasonRequired ? <span className="rt-tag rt-tag--req">{k.required}</span> : <small>{d.common.optional}</small>}
        </label>
        <div className="rt-chips">
          {k.voidPresets.map((p) => (
            <button key={p} type="button" className="rt-chip" aria-pressed={reason === p} onClick={() => setReason(p)}>{p}</button>
          ))}
        </div>
        <input
          id="rt-void-reason"
          className="input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={RESTAURANT_LIMITS.voidReasonMax}
          placeholder={k.voidReasonPh}
          aria-invalid={tried && needReason ? true : undefined}
          autoComplete="off"
        />
        {tried && needReason && <p className="rt-bad" role="alert">{d.restaurant.errors.voidReasonRequired}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/** Mehmonlar soni va buyurtma izohi (updateOrderInfo) */
export function InfoDialog({ order, busy, run, onClose }: { order: OrderView; busy: boolean; run: Runner; onClose: () => void }) {
  const d = useDict();
  const k = d.restaurant.order;
  const [guests, setGuests] = useState(order.guests ?? 0);
  const [note, setNote] = useState(order.note ?? '');

  async function submit() {
    const r = await run('info', () => updateOrderInfoAction(order.id, { guests, note: note.trim() }));
    if (r?.ok) onClose();
  }

  return (
    <Modal
      title={k.infoTitle}
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>{d.common.cancel}</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? d.common.saving : d.common.save}</button>
        </>
      )}
    >
      <form className="rt-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <span className="rt-label">{d.restaurant.common.guests}</span>
        <div className="rt-chips" role="radiogroup" aria-label={d.restaurant.common.guests}>
          {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={guests === n} className="rt-chip" onClick={() => setGuests(n)}>{n}</button>
          ))}
        </div>
        <QtyStepper value={guests} onChange={setGuests} min={0} max={RESTAURANT_LIMITS.maxGuests} label={d.restaurant.common.guests} decLabel={k.qtyDec} incLabel={k.qtyInc} />
        <label className="rt-label" htmlFor="rt-info-note">{k.orderNote}</label>
        <textarea
          id="rt-info-note"
          className="text-area"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={RESTAURANT_LIMITS.noteMax}
          placeholder={k.orderNotePh}
        />
      </form>
    </Modal>
  );
}

interface Waiter { id: string; username: string; name: string; role: 'admin' | 'user' }

/** Boshqa (bo'sh) stolga va/yoki boshqa ofitsantga o'tkazish — order.transfer */
export function TransferDialog({ order, busy, run, onClose }: { order: OrderView; busy: boolean; run: Runner; onClose: () => void }) {
  const d = useDict();
  const k = d.restaurant.order;
  const c = d.restaurant.common;
  const [board, setBoard] = useState<TablesBoard | null>(null);
  const [waiters, setWaiters] = useState<Waiter[] | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [tableId, setTableId] = useState('');
  const [waiterId, setWaiterId] = useState('');
  const dineIn = order.type === 'dine_in';

  useEffect(() => {
    const ctrl = new AbortController();
    const q = `branchId=${encodeURIComponent(order.branchId)}`;
    (async () => {
      try {
        const [t, w] = await Promise.all([
          dineIn ? getJson<TablesBoard>(`/api/restaurant/tables?${q}`, ctrl.signal) : Promise.resolve(null),
          getJson<{ waiters: Waiter[] }>(`/api/restaurant/waiters?${q}`, ctrl.signal),
        ]);
        if (t) { if (t.ok) setBoard(t.data); else setLoadErr(t.error || d.restaurant.errors.failed); }
        if (w.ok) setWaiters(w.data.waiters); else setLoadErr(w.error || d.restaurant.errors.failed);
      } catch { /* yopildi */ }
    })();
    return () => ctrl.abort();
  }, [order.branchId, dineIn, d.restaurant.errors.failed]);

  const free = useMemo(() => {
    if (!board) return [];
    const hallName = new Map(board.halls.map((h) => [h.id, h.name]));
    return board.tables.filter((t) => !t.order && t.id !== order.tableId).map((t) => ({ ...t, hall: hallName.get(t.hallId) ?? '' }));
  }, [board, order.tableId]);
  const multiHall = (board?.halls.length ?? 0) > 1;

  async function submit() {
    if (!tableId && !waiterId) return;
    const r = await run('transfer', () => transferOrderAction(order.id, { tableId: tableId || undefined, waiterId: waiterId || undefined }));
    if (r?.ok) onClose();
  }

  return (
    <Modal
      title={k.transfer}
      onClose={onClose}
      busy={busy}
      wide
      footer={(
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>{d.common.cancel}</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || (!tableId && !waiterId)}>
            {busy ? d.common.loading : k.transferDo}
          </button>
        </>
      )}
    >
      <div className="rt-form">
        {loadErr && <p className="rt-bad" role="alert">{loadErr}</p>}
        {dineIn && (
          <>
            <span className="rt-label" id="rt-tr-tables">
              {k.transferTable}
              {order.tableNumber !== null && <small>{tr(k.currentTable, { n: order.tableNumber })}</small>}
            </span>
            {!board ? (
              loadErr ? null : <p className="rt-muted">{d.common.loading}</p>
            ) : free.length === 0 ? (
              <p className="rt-muted">{k.noFreeTables}</p>
            ) : (
              <div className="rt-chips rt-chips--tables" role="radiogroup" aria-labelledby="rt-tr-tables">
                {free.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={tableId === t.id}
                    className="rt-chip rt-chip--table"
                    onClick={() => setTableId(tableId === t.id ? '' : t.id)}
                    aria-label={`${tr(c.tableN, { n: t.number })}${t.hall ? `, ${t.hall}` : ''}`}
                  >
                    <b>{t.number}</b>
                    {multiHall && <small>{t.hall}</small>}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        <label className="rt-label" htmlFor="rt-tr-waiter">
          {k.transferWaiter}
          {order.waiterName && <small>{tr(k.currentWaiter, { name: order.waiterName })}</small>}
        </label>
        <select id="rt-tr-waiter" className="input" value={waiterId} onChange={(e) => setWaiterId(e.target.value)} disabled={!waiters}>
          <option value="">{waiters ? k.keepWaiter : loadErr ? '—' : d.common.loading}</option>
          {(waiters ?? []).filter((w) => w.id !== order.waiterId).map((w) => (
            <option key={w.id} value={w.id}>{w.name === w.username ? w.name : `${w.name} (${w.username})`}</option>
          ))}
        </select>
      </div>
    </Modal>
  );
}

/** Buyurtmani bekor qilish (yuborilgan faol taom va to'lov bo'lmasa) */
export function CancelDialog({ order, busy, run, onClose }: { order: OrderView; busy: boolean; run: Runner; onClose: () => void }) {
  const d = useDict();
  const k = d.restaurant.order;
  const [reason, setReason] = useState('');

  async function submit() {
    const r = await run('cancel', () => cancelOrderAction(order.id, { reason: reason.trim() || undefined }));
    if (r?.ok) onClose();
  }

  return (
    <Modal
      title={k.cancelOrder}
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>{d.common.back}</button>
          <button type="button" className="btn btn-danger-fill" onClick={submit} disabled={busy}>{busy ? d.common.loading : k.cancelOrder}</button>
        </>
      )}
    >
      <form className="rt-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <p className="rt-hint rt-hint--warn">{k.cancelHint}</p>
        <label className="rt-label" htmlFor="rt-cancel-reason">{k.cancelReason} <small>{d.common.optional}</small></label>
        <input
          id="rt-cancel-reason"
          className="input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={RESTAURANT_LIMITS.voidReasonMax}
          autoComplete="off"
        />
      </form>
    </Modal>
  );
}

/** Oddiy tasdiq (hisobni qayta ochish va h.k.) */
export function ConfirmDialog({ title, text, confirmLabel, busy, onConfirm, onClose }: {
  title: string;
  text: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const d = useDict();
  return (
    <Modal
      title={title}
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>{d.common.cancel}</button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={busy} data-autofocus>{busy ? d.common.loading : confirmLabel}</button>
        </>
      )}
    >
      <p className="rt-hint">{text}</p>
    </Modal>
  );
}
