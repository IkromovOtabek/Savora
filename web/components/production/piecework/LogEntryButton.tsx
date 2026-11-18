'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { fmtMoney } from '@/lib/format';
import { isFractionalUnit, parseQty, priceTimesQty } from '@/lib/qty';
import { toDayKey } from '@/lib/period';
import { logPieceworkAction } from '@/app/actions/production';
import type { OrderSummary } from '@/lib/production/orders';
import { PwModal, newClientId, useRunAction } from './ui';

export interface WorkerOption { id: string; name: string }

const MANUAL = '__manual';

/**
 * «Ish yozish»: akt → texkarta operatsiyasi (narx serverda, ko'rsatiladi) → miqdor. Tasdiqlovchi boshqa ishchi
 * uchun ham yozadi va aktsiz yozuvda narxni o'zi kiritadi. `clientId` — oyna ochiq turganda takroriy bosish
 * (yoki javob kelmay qayta yuborish) ikkinchi yozuv bermaydi; muvaffaqiyatdan keyin yangilanadi.
 */
export default function LogEntryButton({ canApprove, selfName, workers }: {
  canApprove: boolean;
  selfName: string;
  workers: WorkerOption[];
}) {
  const d = useDict();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-primary btn-with-icon pw-add" onClick={() => setOpen(true)}>
        <Icon name="plus" size={18} />{d.production.piecework.add}
      </button>
      {open && <LogEntryDialog onClose={() => setOpen(false)} canApprove={canApprove} selfName={selfName} workers={workers} />}
    </>
  );
}

function LogEntryDialog({ onClose, canApprove, selfName, workers }: {
  onClose: () => void;
  canApprove: boolean;
  selfName: string;
  workers: WorkerOption[];
}) {
  const d = useDict();
  const t = d.production.piecework;
  const { pending, run } = useRunAction();
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [ordersErr, setOrdersErr] = useState<string | null>(null);
  const [workerId, setWorkerId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [opName, setOpName] = useState('');
  const [manualOp, setManualOp] = useState('');
  const [rateText, setRateText] = useState('');
  const [qtyText, setQtyText] = useState('');
  const [day, setDay] = useState<string>(() => toDayKey(new Date()));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const clientId = useRef(newClientId());

  useEffect(() => {
    let alive = true;
    fetch('/api/production/orders?status=active&limit=200', { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok) { setOrdersErr(typeof j.error === 'string' ? j.error : t.loadFailed); setOrders([]); return; }
        setOrders(Array.isArray(j.items) ? j.items : []);
      })
      .catch(() => { if (alive) { setOrdersErr(t.loadFailed); setOrders([]); } });
    return () => { alive = false; };
  }, [t.loadFailed]);

  const manual = orderId === MANUAL;
  const order = useMemo(() => orders?.find((o) => o.id === orderId) ?? null, [orders, orderId]);
  const op = order?.operations.find((o) => o.name === opName) ?? null;
  // Aktning birligi (dona — butun, kg/m — kasr); aktsiz yozuvda kasr ruxsat
  const unit = manual ? 'kg' : order?.unit ?? 'dona';
  const qty = parseQty(qtyText, unit);
  const rate = manual ? (/^\d{1,10}$/.test(rateText.replace(/\s/g, '')) ? Number(rateText.replace(/\s/g, '')) : null) : op?.rate ?? null;
  const operation = manual ? manualOp.trim() : op?.name ?? '';
  const amount = qty !== null && rate !== null ? priceTimesQty(rate, qty) : null;
  const today = toDayKey(new Date());
  const ready = !!operation && qty !== null && rate !== null && !!day && day <= today && (manual ? canApprove : !!order);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || pending || qty === null) return;
    setError(null);
    const [y, m, dd] = day.split('-').map(Number);
    run(() => logPieceworkAction({
      workerId: canApprove && workerId ? workerId : undefined,
      productionOrderId: order ? order.id : undefined,
      operation,
      qty,
      rate: manual && rate !== null ? rate : undefined,
      // Bugun — server vaqti (aniq soat); o'tgan kun — o'sha kun peshin (mahalliy), kun chegarasida siljimasin
      workDate: day === today ? undefined : new Date(y, m - 1, dd, 12, 0, 0),
      note: note.trim() || undefined,
      clientId: clientId.current,
    }), {
      ok: () => d.production.msg.entryLogged,
      after: () => { clientId.current = newClientId(); onClose(); },
      onError: (msg) => setError(msg),
    });
  }

  const loading = orders === null;
  const noOrders = !loading && (orders?.length ?? 0) === 0;

  return (
    <PwModal
      title={t.formTitle}
      onClose={onClose}
      busy={pending}
      footer={
        <>
          {amount !== null && <span className="pw-foot-sum">{t.formAmount}: <b>{fmtMoney(amount)}</b> {d.common.sum}</span>}
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>{d.common.cancel}</button>
          <button type="submit" form="pw-log-form" className="btn btn-primary" disabled={!ready || pending}>{pending ? d.common.saving : t.formSave}</button>
        </>
      }
    >
      <form id="pw-log-form" onSubmit={submit} className="pw-form">
        {canApprove && workers.length > 0 && (
          <div className="auth-field">
            <label htmlFor="pw-worker">{t.formWorker}</label>
            <select id="pw-worker" value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
              <option value="">{tr(t.formSelf, { name: selfName })}</option>
              {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        )}

        <div className="auth-field">
          <label htmlFor="pw-order">{t.formOrder}</label>
          {loading ? (
            <p className="pw-muted">{t.formLoading}</p>
          ) : (
            <select
              id="pw-order"
              value={orderId}
              data-autofocus
              onChange={(e) => {
                setOrderId(e.target.value);
                const next = orders?.find((o) => o.id === e.target.value);
                // Yagona operatsiya — darhol tanlanadi
                setOpName(next && next.operations.length === 1 ? next.operations[0].name : '');
              }}
            >
              <option value="">{t.formOrderPick}</option>
              {orders?.map((o) => <option key={o.id} value={o.id}>{o.docNo} · {o.outputName}</option>)}
              {canApprove && <option value={MANUAL}>{t.formManual}</option>}
            </select>
          )}
          {ordersErr ? <p className="field-error">{ordersErr}</p> : noOrders && !canApprove ? <p className="field-hint">{t.formNoOrders}</p> : null}
        </div>

        {order && (
          order.operations.length === 0 ? (
            <p className="t-note t-note--warn pw-note">{t.formNoOperations}</p>
          ) : (
            <fieldset className="pw-ops">
              <legend>{t.formOperation}</legend>
              {order.operations.map((o) => (
                <label key={o.name} className={`pw-op${opName === o.name ? ' is-on' : ''}`}>
                  <input type="radio" name="pw-op" value={o.name} checked={opName === o.name} onChange={() => setOpName(o.name)} />
                  <span className="pw-op-name">{o.name}</span>
                  <span className="pw-op-rate">{fmtMoney(o.rate)} {d.common.sum}</span>
                </label>
              ))}
            </fieldset>
          )
        )}

        {manual && (
          <div className="form-row">
            <div className="auth-field">
              <label htmlFor="pw-opname">{t.formOperationName}</label>
              <input id="pw-opname" value={manualOp} maxLength={80} placeholder={t.formOperationPh} onChange={(e) => setManualOp(e.target.value)} required />
            </div>
            <div className="auth-field">
              <label htmlFor="pw-rate">{t.formRate}</label>
              <input id="pw-rate" inputMode="numeric" value={rateText} onChange={(e) => setRateText(e.target.value.replace(/[^\d\s]/g, ''))} required />
            </div>
          </div>
        )}

        {(op || manual) && (
          <div className="form-row">
            <div className="auth-field">
              <label htmlFor="pw-qty">{t.formQty}{order?.unit ? ` (${d.stock.fields.units[order.unit] ?? order.unit})` : ''}</label>
              <input
                id="pw-qty"
                className="pw-qty-input"
                inputMode={isFractionalUnit(unit) ? 'decimal' : 'numeric'}
                value={qtyText}
                onChange={(e) => setQtyText(e.target.value.replace(/[^\d.,]/g, ''))}
                required
              />
              {op && <p className="field-hint">{tr(t.formRateAuto, { rate: fmtMoney(op.rate) })}</p>}
            </div>
            <div className="auth-field">
              <label htmlFor="pw-day">{t.formDate}</label>
              <input id="pw-day" type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} required />
            </div>
          </div>
        )}

        {(op || manual) && (
          <div className="auth-field">
            <label htmlFor="pw-note">{t.formNote}</label>
            <input id="pw-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}

        {error && <p className="field-error" role="alert">{error}</p>}
      </form>
    </PwModal>
  );
}
