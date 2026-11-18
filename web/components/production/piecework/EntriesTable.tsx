'use client';

import { useMemo, useState } from 'react';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { fmtDate, fmtMoney } from '@/lib/format';
import { fmtQty, isFractionalUnit, parseQty, priceTimesQty } from '@/lib/qty';
import { approvePieceworkAction, editPieceworkAction, rejectPieceworkAction } from '@/app/actions/production';
import type { PieceworkView } from '@/lib/production/piecework';
import { PwModal, StatusBadge, useRunAction } from './ui';

/**
 * Ishbay yozuvlari jadvali: tasdiqlovchi «yozildi» holatidagilarni belgilab birga tasdiqlaydi yoki rad etadi
 * (pastda qotib turadigan panel), «yozildi» yozuvni tuzatadi (ishchi — miqdorni, tasdiqlovchi — narxni ham).
 * Tugmalar har yozuvning `can` obyektidan (server) chiziladi.
 */
export default function EntriesTable({ items, canApprove, showWorker }: {
  items: PieceworkView[];
  canApprove: boolean;
  showWorker: boolean;
}) {
  const d = useDict();
  const t = d.production.piecework;
  const st = d.production.common.pieceworkStatuses;
  const { pending, run } = useRunAction();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState(false);
  const [editing, setEditing] = useState<PieceworkView | null>(null);

  const selectable = useMemo(() => items.filter((e) => e.can.approve), [items]);
  // Sahifa yangilanganda (refresh) holati o'zgargan yozuvlar tanlovdan tushadi
  const chosen = selectable.filter((e) => sel.has(e.id));
  const chosenSum = chosen.reduce((s, e) => s + e.amount, 0);
  const allOn = selectable.length > 0 && chosen.length === selectable.length;

  const toggle = (id: string) => setSel((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setSel(allOn ? new Set() : new Set(selectable.map((e) => e.id)));

  function approve() {
    const ids = chosen.map((e) => e.id);
    if (!ids.length) return;
    run(() => approvePieceworkAction({ ids }), { after: () => setSel(new Set()) });
  }

  return (
    <>
      <div className="table-wrap">
        <table className="data-table pw-table">
          <thead>
            <tr>
              {canApprove && (
                <th className="pw-check-col">
                  <label className="pw-check">
                    <input type="checkbox" checked={allOn} onChange={toggleAll} disabled={!selectable.length} aria-label={t.selectAll} />
                  </label>
                </th>
              )}
              <th>{t.colOperation}</th>
              {showWorker && <th>{t.colWorker}</th>}
              <th>{t.colDate}</th>
              <th className="num">{t.colQty}</th>
              <th className="num">{t.colRate}</th>
              <th className="num">{t.colAmount}</th>
              <th>{t.colStatus}</th>
              <th className="cell-actions"><span className="sr-only">{t.colActions}</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.id} className={`${sel.has(e.id) && e.can.approve ? 'pw-row-on' : ''}${e.status === 'rejected' ? ' row-cancelled' : ''}`}>
                {canApprove && (
                  <td className="pw-check-col" data-label="">
                    {e.can.approve && (
                      <label className="pw-check">
                        <input type="checkbox" checked={sel.has(e.id)} onChange={() => toggle(e.id)} aria-label={tr(t.selectRow, { name: e.operation })} />
                      </label>
                    )}
                  </td>
                )}
                <td data-label={t.colOperation}>
                  <span className="cell-main">{e.operation}</span>
                  <div className="cell-sub">
                    {e.productionOrderNo ?? t.noOrder}
                    {e.note ? ` · ${e.note}` : ''}
                  </div>
                  {e.status === 'rejected' && e.rejectReason && <div className="cell-sub cell-sub--danger">{tr(t.rejectedReason, { reason: e.rejectReason })}</div>}
                </td>
                {showWorker && <td data-label={t.colWorker}>{e.workerName}</td>}
                <td data-label={t.colDate}>{e.workDate ? fmtDate(e.workDate) : '—'}</td>
                <td data-label={t.colQty} className="num">{fmtQty(e.qty)}</td>
                <td data-label={t.colRate} className="num">{fmtMoney(e.rate)}</td>
                <td data-label={t.colAmount} className="num"><b>{fmtMoney(e.amount)}</b></td>
                <td data-label={t.colStatus}>
                  <StatusBadge status={e.status} label={st[e.status]} />
                  {e.status === 'approved' && e.approvedBy && <div className="cell-sub">{tr(t.approvedBy, { by: e.approvedBy })}</div>}
                  {e.status === 'paid' && e.paidBy && <div className="cell-sub">{tr(t.paidBy, { by: e.paidBy })}</div>}
                </td>
                <td className="cell-actions" data-label="">
                  {e.can.edit && (
                    <button type="button" className="btn btn-ghost btn-sm btn-with-icon" onClick={() => setEditing(e)} disabled={pending}>
                      <Icon name="edit" size={15} />{t.edit}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Qotgan panel oxirgi qatorlarni yopmasin */}
      {canApprove && chosen.length > 0 && <div className="pw-bar-space" aria-hidden="true" />}
      {canApprove && chosen.length > 0 && (
        <div className="pw-bar" role="region" aria-label={tr(t.selectedN, { n: chosen.length })}>
          <span className="pw-bar-info">
            <b>{tr(t.selectedN, { n: chosen.length })}</b>
            <span>{tr(t.selectedSum, { sum: fmtMoney(chosenSum) })}</span>
          </span>
          <div className="pw-bar-actions">
            <button type="button" className="btn btn-plain" onClick={() => setSel(new Set())} disabled={pending}>{t.clearSelection}</button>
            <button type="button" className="btn btn-danger btn-with-icon" onClick={() => setRejecting(true)} disabled={pending}>
              <Icon name="close" size={16} />{t.reject}
            </button>
            <button type="button" className="btn btn-primary btn-with-icon" onClick={approve} disabled={pending}>
              <Icon name="check" size={16} />{t.approve}
            </button>
          </div>
        </div>
      )}

      {rejecting && (
        <RejectDialog
          ids={chosen.map((e) => e.id)}
          onClose={() => setRejecting(false)}
          onDone={() => { setRejecting(false); setSel(new Set()); }}
        />
      )}
      {editing && <EditDialog entry={editing} canApprove={canApprove} onClose={() => setEditing(null)} />}
    </>
  );
}

function RejectDialog({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone: () => void }) {
  const d = useDict();
  const t = d.production.piecework;
  const { pending, run } = useRunAction();
  const [reason, setReason] = useState('');
  return (
    <PwModal
      title={t.rejectTitle}
      onClose={onClose}
      busy={pending}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>{d.common.cancel}</button>
          <button
            type="button"
            className="btn btn-danger-fill"
            disabled={pending || !ids.length}
            onClick={() => run(() => rejectPieceworkAction({ ids, reason: reason.trim() || undefined }), { after: onDone })}
          >
            {t.reject}
          </button>
        </>
      }
    >
      <p className="pw-muted">{tr(t.rejectConfirm, { n: ids.length })}</p>
      <div className="auth-field">
        <label htmlFor="pw-reason">{t.rejectReason}</label>
        <textarea id="pw-reason" value={reason} maxLength={300} placeholder={t.rejectReasonPh} onChange={(e) => setReason(e.target.value)} data-autofocus />
      </div>
    </PwModal>
  );
}

function EditDialog({ entry, canApprove, onClose }: { entry: PieceworkView; canApprove: boolean; onClose: () => void }) {
  const d = useDict();
  const t = d.production.piecework;
  const { pending, run } = useRunAction();
  const [qtyText, setQtyText] = useState(fmtQty(entry.qty));
  const [rateText, setRateText] = useState(String(entry.rate));
  // Birlik — yozuvdagi (aktdagi tayyor mahsulot birligi: dona — butun); aktsiz yozuvda — kasr ruxsat
  const unit = entry.unit ?? 'kg';
  const frac = isFractionalUnit(unit);
  const qty = parseQty(qtyText, unit);
  const rateClean = rateText.replace(/\s/g, '');
  const rate = /^\d{1,10}$/.test(rateClean) ? Number(rateClean) : null;
  const ready = qty !== null && (!canApprove || rate !== null);
  const changed = qty !== entry.qty || (canApprove && rate !== entry.rate);

  function save() {
    if (!ready || qty === null) return;
    run(() => editPieceworkAction({ id: entry.id, qty, ...(canApprove && rate !== null && rate !== entry.rate ? { rate } : {}) }), { after: onClose });
  }

  return (
    <PwModal
      title={t.editTitle}
      onClose={onClose}
      busy={pending}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>{d.common.cancel}</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={!ready || !changed || pending}>{pending ? d.common.saving : d.common.save}</button>
        </>
      }
    >
      <p className="pw-edit-head">
        <b>{entry.operation}</b>
        <span>{[entry.workerName, entry.productionOrderNo ?? t.noOrder, entry.workDate ? fmtDate(entry.workDate) : null].filter(Boolean).join(' · ')}</span>
      </p>
      <div className="form-row">
        <div className="auth-field">
          <label htmlFor="pw-eqty">{t.formQty}</label>
          <input id="pw-eqty" className="pw-qty-input" inputMode={frac ? 'decimal' : 'numeric'} value={qtyText} onChange={(e) => setQtyText(e.target.value.replace(frac ? /[^\d.,]/g : /\D/g, ''))} aria-invalid={(qtyText !== '' && qty === null) || undefined} data-autofocus />
        </div>
        <div className="auth-field">
          <label htmlFor="pw-erate">{t.formRate}</label>
          <input id="pw-erate" inputMode="numeric" value={rateText} disabled={!canApprove} onChange={(e) => setRateText(e.target.value.replace(/[^\d\s]/g, ''))} />
          {!canApprove && <p className="field-hint">{t.editRateHint}</p>}
        </div>
      </div>
      {qty !== null && rate !== null && (
        <p className="pw-muted">{t.formAmount}: <b>{fmtMoney(priceTimesQty(rate, qty))}</b> {d.common.sum}</p>
      )}
    </PwModal>
  );
}
