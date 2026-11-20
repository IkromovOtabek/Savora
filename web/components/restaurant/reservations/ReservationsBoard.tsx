'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { toast } from '@/lib/toast';
import { fmtQty } from '@/lib/qty';
import { RESERVATION_LIMITS, addDays, groupByHour } from '@/lib/restaurant/reservationRules';
import type { ReservationForm as FormData, ReservationView, ReservationsDay } from '@/lib/restaurant/reservations';
import {
  cancelReservationAction, noShowReservationAction, seatReservationAction,
} from '@/app/actions/reservations';
import { useRun } from '@/components/restaurant/settings/useRun';
import Modal from '@/components/restaurant/order/Modal';
import { useNow, usePolling } from '@/components/restaurant/order/shared';
import ReservationForm from './ReservationForm';

type Dialog =
  | { kind: 'new' }
  | { kind: 'edit'; r: ReservationView }
  | { kind: 'cancel'; r: ReservationView }
  | { kind: 'noShow'; r: ReservationView };

/** Taomlar qisqacha: «Osh (Katta) ×2, Non ×2» */
function itemsLine(r: ReservationView): string {
  return r.items.map((i) => `${i.name}${i.options.length ? ` (${i.options.join(', ')})` : ''} ×${fmtQty(i.qty)}`).join(', ');
}

/**
 * Bronlar sahifasi (/app/restaurant/reservations): kun almashtirgich (Bugun / Ertaga / sana), soat bo'yicha ro'yxat,
 * holat belgilari, «Keldi» (stol ochiladi → buyurtma ekrani), «Tahrirlash», «Bekor qilish», «Kelmadi». Ma'lumot — serverdan
 * (URL: ?d=YYYY-MM-DD&branch=), amallardan keyin `router.refresh()`; har daqiqada jim yangilanadi.
 */
export default function ReservationsBoard({ data, form }: { data: ReservationsDay; form: FormData | null }) {
  const d = useDict();
  const t = d.reservations;
  const router = useRouter();
  const { pending, run } = useRun();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const now = useNow(Date.parse(data.serverTime), 0, 30_000);
  usePolling(async () => { if (!dialog) router.refresh(); }, 60_000);

  const canManage = data.can.manage && !!form;
  const groups = useMemo(() => groupByHour(data.items), [data.items]);
  const tomorrow = addDays(data.today, 1);

  function go(date: string, branch = data.branchId) {
    const q = new URLSearchParams();
    if (date !== data.today) q.set('d', date);
    if (data.branches.length > 1) q.set('branch', branch);
    const s = q.toString();
    router.push(`/app/restaurant/reservations${s ? `?${s}` : ''}`);
  }

  function seat(r: ReservationView) {
    setBusyId(r.id);
    run(() => seatReservationAction(r.id), {
      refresh: false,
      after: (res) => {
        if (res.skipped.length) toast(tr(t.seatedSkipped, { n: res.skipped.length, names: res.skipped.map((x) => x.name).join(', ') }), 'warn');
        router.push(`/app/tables/${res.orderId}`);
      },
      ok: (res) => (res.skipped.length ? '' : t.seated),
    });
  }

  const visible = data.items.length;
  const head = (
    <div className="rsv-head">
      <div>
        <h1 className="t-page-title">{t.title}</h1>
        <p className="t-page-sub">{visible ? tr(t.counts, { n: data.counts.booked + data.counts.seated, g: data.counts.guests }) : t.sub}</p>
      </div>
      {canManage && (
        <button type="button" className="btn btn-primary btn-with-icon rsv-new" onClick={() => setDialog({ kind: 'new' })}>
          <Icon name="plus" size={18} />
          {t.newBtn}
        </button>
      )}
    </div>
  );

  const days = (
    <div className="rsv-days">
      <button type="button" className="rsv-arrow" onClick={() => go(addDays(data.date, -1))} aria-label={t.prevDay}>
        <Icon name="arrowLeft" size={18} />
      </button>
      <div className="rt-seg" role="radiogroup" aria-label={t.pickDate}>
        <button type="button" role="radio" aria-checked={data.date === data.today} onClick={() => go(data.today)}>{t.today}</button>
        <button type="button" role="radio" aria-checked={data.date === tomorrow} onClick={() => go(tomorrow)}>{t.tomorrow}</button>
      </div>
      <input
        type="date"
        className="input rsv-date"
        value={data.date}
        aria-label={t.pickDate}
        onChange={(e) => { if (e.target.value) go(e.target.value); }}
      />
      <button type="button" className="rsv-arrow" onClick={() => go(addDays(data.date, 1))} aria-label={t.nextDay}>
        <Icon name="arrowRight" size={18} />
      </button>
      {data.branches.length > 1 && (
        <select className="input rsv-branch" value={data.branchId} aria-label={t.branch} onChange={(e) => go(data.date, e.target.value)}>
          {data.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      )}
    </div>
  );

  return (
    <div className="rsv-page">
      {head}
      {days}

      {!visible ? (
        <div className="rsv-empty">
          <b>{t.empty}</b>
          <span>{canManage ? t.emptyHint : t.emptyHintNoManage}</span>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.hour} aria-label={g.hour}>
            <h2 className="rsv-hour">{g.hour}</h2>
            <ul className="rsv-list">
              {g.items.map((r) => {
                const booked = r.status === 'booked';
                const started = now >= Date.parse(r.startAt);
                // «Keldi» — boshlanishiga ≤ 3 soat qolganda (server ham tekshiradi: reservationTooEarly)
                const seatable = booked && Date.parse(r.startAt) - now <= RESERVATION_LIMITS.seatEarlyMin * 60_000;
                const busy = pending && busyId === r.id;
                return (
                  <li key={r.id} className="rsv-card" data-status={r.status} data-late={r.late || undefined}>
                    <div className="rsv-time">
                      <b>{r.time}</b>
                      <small>–{r.endTime}</small>
                    </div>
                    <div className="rsv-main">
                      <div className="rsv-name">
                        <span>{r.customerName}</span>
                        {r.late ? <span className="rt-tag rsv-tag--late">{t.late}</span>
                          : r.status === 'seated' ? <span className="rt-tag rsv-tag--seated">{t.statuses.seated}</span>
                          : !booked ? <span className="rt-tag rsv-tag--off">{t.statuses[r.status]}</span> : null}
                      </div>
                      <div className="rsv-meta">
                        <span className="rsv-table">{tr(t.tableN, { n: r.tableNumber })}</span>
                        <span>{tr(t.guestsN, { n: r.guests })}</span>
                        {r.hallName && <span>{r.hallName}</span>}
                        <a href={`tel:${r.customerPhone.replace(/[^\d+]/g, '')}`} aria-label={`${t.callPhone}: ${r.customerPhone}`}>{r.customerPhone}</a>
                      </div>
                      {r.items.length > 0 && <p className="rsv-items"><b>{tr(t.itemsN, { n: r.items.length })}:</b> {itemsLine(r)}</p>}
                      {r.note && <p className="rsv-note">{r.note}</p>}
                      {r.cancelReason && <p className="rsv-by">{tr(t.reasonLine, { reason: r.cancelReason })}</p>}
                      {r.createdBy && <p className="rsv-by">{tr(t.createdBy, { name: r.createdBy })}</p>}
                    </div>
                    <div className="rsv-actions">
                      {seatable && (
                        <button type="button" className="btn btn-primary" onClick={() => seat(r)} disabled={pending}>
                          {busy ? d.common.loading : t.actions.seat}
                        </button>
                      )}
                      {r.status === 'seated' && r.orderId && (
                        <Link className="btn btn-tinted" href={`/app/tables/${r.orderId}`}>{t.actions.openOrder}</Link>
                      )}
                      {booked && canManage && (
                        <button type="button" className="btn btn-ghost" onClick={() => setDialog({ kind: 'edit', r })} disabled={pending}>
                          {t.actions.edit}
                        </button>
                      )}
                      {booked && canManage && (
                        <div className="rsv-actions-row">
                          {started && (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDialog({ kind: 'noShow', r })} disabled={pending}>
                              {t.actions.noShow}
                            </button>
                          )}
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => setDialog({ kind: 'cancel', r })} disabled={pending}>
                            {t.actions.cancel}
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {form && (dialog?.kind === 'new' || dialog?.kind === 'edit') && (
        <ReservationForm
          form={form}
          date={data.date}
          today={data.today}
          editing={dialog.kind === 'edit' ? dialog.r : null}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); router.refresh(); }}
        />
      )}
      {dialog?.kind === 'cancel' && (
        <CancelDialog r={dialog.r} busy={pending} onClose={() => setDialog(null)} onConfirm={(reason) => {
          run(() => cancelReservationAction(dialog.r.id, { reason }), { after: () => setDialog(null) });
        }} />
      )}
      {dialog?.kind === 'noShow' && (
        <Modal
          title={t.noShowTitle}
          busy={pending}
          onClose={() => setDialog(null)}
          footer={(
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setDialog(null)} disabled={pending}>{t.keep}</button>
              <button type="button" className="btn btn-primary" data-autofocus disabled={pending} onClick={() => {
                run(() => noShowReservationAction(dialog.r.id), { after: () => setDialog(null) });
              }}>{pending ? d.common.loading : t.actions.noShow}</button>
            </>
          )}
        >
          <p className="rt-hint">{tr(t.noShowText, { name: dialog.r.customerName, time: dialog.r.time, table: tr(t.tableN, { n: dialog.r.tableNumber }) })}</p>
        </Modal>
      )}
    </div>
  );
}

function CancelDialog({ r, busy, onClose, onConfirm }: { r: ReservationView; busy: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const d = useDict();
  const t = d.reservations;
  const [reason, setReason] = useState('');
  return (
    <Modal
      title={t.cancelTitle}
      busy={busy}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>{t.keep}</button>
          <button type="button" className="btn btn-danger-fill" onClick={() => onConfirm(reason)} disabled={busy}>
            {busy ? d.common.loading : t.actions.cancel}
          </button>
        </>
      )}
    >
      <form className="rt-form" onSubmit={(e) => { e.preventDefault(); onConfirm(reason); }}>
        <p className="rt-hint">{`${r.time}–${r.endTime} · ${tr(t.tableN, { n: r.tableNumber })} · ${r.customerName}`}</p>
        <label className="rt-label" htmlFor="rsv-cancel-reason">{t.cancelReason} <small>{d.common.optional}</small></label>
        <div className="rt-chips">
          {t.cancelReasons.map((p) => (
            <button key={p} type="button" className="rt-chip" aria-pressed={reason === p} onClick={() => setReason(reason === p ? '' : p)}>{p}</button>
          ))}
        </div>
        <textarea
          id="rsv-cancel-reason"
          className="text-area"
          rows={2}
          maxLength={200}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t.cancelReasonPh}
        />
      </form>
    </Modal>
  );
}
