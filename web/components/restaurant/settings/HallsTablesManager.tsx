'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/icons/Icon';
import { toast } from '@/lib/toast';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { RESTAURANT_LIMITS } from '@/lib/restaurant/types';
import type { RestaurantSetupView } from '@/lib/restaurant/queries';
import {
  createTablesRangeAction,
  deleteHallAction,
  deleteTableAction,
  regenerateTableQrAction,
  saveHallAction,
  saveTableAction,
} from '@/app/actions/restaurant';
import type { ActionResult } from '@/lib/restaurant/session';
import QrCode from './QrCode';
import { useRun } from './useRun';

type Table = RestaurantSetupView['tables'][number];
type Hall = RestaurantSetupView['halls'][number];

const intIn = (v: string, min: number, max: number): number | null => {
  const n = Number(v.trim());
  return v.trim() !== '' && Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/** Zal va stollar: zal CRUD, stol CRUD, oraliq bilan qo'shish, faol/nofaol, QR (ko'rish, almashtirish, chop etish) */
export default function HallsTablesManager({ data, qrMenu }: { data: RestaurantSetupView; qrMenu: boolean }) {
  const d = useDict();
  const t = d.restaurant.settings;
  const { pending, run } = useRun();

  const [hallId, setHallId] = useState(data.halls[0]?.id ?? '');
  const hall: Hall | null = data.halls.find((h) => h.id === hallId) ?? data.halls[0] ?? null;
  const countByHall = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of data.tables) m.set(x.hallId, (m.get(x.hallId) ?? 0) + 1);
    return m;
  }, [data.tables]);
  const tables = hall ? data.tables.filter((x) => x.hallId === hall.id) : [];
  // Raqam filial ichida noyob — keyingi bo'sh raqam (taklif)
  const nextNumber = Math.min(RESTAURANT_LIMITS.maxTableNumber, data.tables.reduce((m, x) => Math.max(m, x.number), 0) + 1);

  // Zal formalari
  const [addingHall, setAddingHall] = useState(data.halls.length === 0);
  const [newHall, setNewHall] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [hallDraft, setHallDraft] = useState('');
  // Stol qo'shish
  const [num, setNum] = useState('');
  const [seats, setSeats] = useState('4');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rSeats, setRSeats] = useState('4');
  // Stolni tahrirlash
  const [edit, setEdit] = useState<{ id: string; number: string; seats: string; hallId: string } | null>(null);
  // QR oynasi
  const [qrId, setQrId] = useState<string | null>(null);
  const qrTable = qrId ? data.tables.find((x) => x.id === qrId) ?? null : null;

  useEffect(() => {
    setRenaming(false);
    setEdit(null);
  }, [hall?.id]);

  function addHall(e: React.FormEvent) {
    e.preventDefault();
    const name = newHall.trim();
    if (!name) return;
    run(() => saveHallAction({ name, branchId: data.branchId }), {
      after: (r) => {
        setHallId(r.id);
        setNewHall('');
        setAddingHall(false);
      },
    });
  }

  function renameHall(e: React.FormEvent) {
    e.preventDefault();
    if (!hall || !hallDraft.trim()) return;
    run(() => saveHallAction({ id: hall.id, name: hallDraft.trim() }), { after: () => setRenaming(false) });
  }

  function addTable(e: React.FormEvent) {
    e.preventDefault();
    if (!hall) return;
    const n = num.trim() ? intIn(num, 1, RESTAURANT_LIMITS.maxTableNumber) : nextNumber;
    const s = intIn(seats, 1, RESTAURANT_LIMITS.maxSeats);
    if (!n || !s) {
      toast(d.restaurant.errors.badInput, 'error');
      return;
    }
    run(() => saveTableAction({ hallId: hall.id, number: n, seats: s }), { after: () => setNum('') });
  }

  // Bo'sh maydon — taklif (keyingi bo'sh raqamdan 20 ta): bir bosishda 20 ta stol
  const rangeToDefault = Math.min(nextNumber + 19, RESTAURANT_LIMITS.maxTableNumber);
  const rFrom = from.trim() ? intIn(from, 1, RESTAURANT_LIMITS.maxTableNumber) : nextNumber;
  const rTo = to.trim() ? intIn(to, 1, RESTAURANT_LIMITS.maxTableNumber) : rangeToDefault;
  const rTooBig = rFrom !== null && rTo !== null && rTo - rFrom >= 100;
  const rangeOk = rFrom !== null && rTo !== null && rTo >= rFrom && !rTooBig && intIn(rSeats, 1, RESTAURANT_LIMITS.maxSeats) !== null;

  function addRange(e: React.FormEvent) {
    e.preventDefault();
    if (!hall || !rangeOk || rFrom === null || rTo === null) return;
    run(() => createTablesRangeAction({ hallId: hall.id, from: rFrom, to: rTo, seats: Number(rSeats) }), {
      ok: (r) => {
        if (!r.skipped.length) return tr(t.rangeResult, { created: r.created });
        const list = r.skipped.slice(0, 12).join(', ') + (r.skipped.length > 12 ? '…' : '');
        return tr(t.rangeSkipped, { created: r.created, list });
      },
      after: () => {
        setFrom('');
        setTo('');
      },
    });
  }

  function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    const n = intIn(edit.number, 1, RESTAURANT_LIMITS.maxTableNumber);
    const s = intIn(edit.seats, 1, RESTAURANT_LIMITS.maxSeats);
    if (!n || !s) {
      toast(d.restaurant.errors.badInput, 'error');
      return;
    }
    run(() => saveTableAction({ id: edit.id, hallId: edit.hallId, number: n, seats: s }), { after: () => setEdit(null) });
  }

  /** Zal tartibi: qo'shni zal bilan o'rin almashadi, `sort` 0.. ketma-ket qayta yoziladi (faqat o'zgarganlari) */
  function moveHall(dir: -1 | 1) {
    if (!hall) return;
    const list = [...data.halls];
    const i = list.findIndex((h) => h.id === hall.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    run(async () => {
      let last: ActionResult<{ id: string }> = { ok: true, data: { id: hall.id } };
      for (let n = 0; n < list.length; n++) {
        if (list[n].sort === n) continue;
        last = await saveHallAction({ id: list[n].id, name: list[n].name, sort: n });
        if (!last.ok) break;
      }
      return last;
    }, { ok: t.hallMoved });
  }
  const hallIdx = hall ? data.halls.findIndex((h) => h.id === hall.id) : -1;

  // Faol/nofaol: o'rindiq soni ham yuboriladi (aks holda server standart 4 ni yozadi)
  const toggleTable = (x: Table) =>
    run(() => saveTableAction({ id: x.id, hallId: x.hallId, number: x.number, seats: x.seats, active: !x.active }));

  const printHref = hall ? `/app/restaurant/tables/print?hall=${hall.id}&branch=${data.branchId}` : '';

  return (
    <div className="rs-stack">
      {/* Zallar */}
      <section className="rs-card" aria-labelledby="rs-halls-h">
        <div className="rs-card-head">
          <h2 className="rs-h" id="rs-halls-h">{t.halls}</h2>
          {!addingHall && (
            <button type="button" className="btn btn-sm btn-tinted btn-with-icon" onClick={() => setAddingHall(true)}>
              <Icon name="plus" size={15} /> {t.addHall}
            </button>
          )}
        </div>

        {data.halls.length > 0 && (
          <div className="rs-chips" role="group" aria-label={t.halls}>
            {data.halls.map((h) => (
              <button
                key={h.id}
                type="button"
                className={`rs-chip${h.id === hall?.id ? ' is-on' : ''}${h.active ? '' : ' is-off'}`}
                aria-pressed={h.id === hall?.id}
                onClick={() => setHallId(h.id)}
              >
                <span>{h.name}</span>
                <small>{countByHall.get(h.id) ?? 0}</small>
              </button>
            ))}
          </div>
        )}

        {addingHall && (
          <form className="rs-inline" onSubmit={addHall}>
            <input
              className="input"
              value={newHall}
              onChange={(e) => setNewHall(e.target.value)}
              placeholder={t.hallNamePh}
              aria-label={t.hallName}
              maxLength={60}
              autoFocus={data.halls.length > 0}
              disabled={pending}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={pending || !newHall.trim()}>{d.common.add}</button>
            {data.halls.length > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAddingHall(false); setNewHall(''); }}>{d.common.cancel}</button>
            )}
          </form>
        )}
        {data.halls.length === 0 && <p className="rs-empty">{t.hallsEmpty}</p>}
      </section>

      {hall && (
        <section className={`rs-card${hall.active ? '' : ' is-off'}`} aria-labelledby="rs-hall-h">
          <div className="rs-card-head">
            {renaming ? (
              <form className="rs-inline rs-grow" onSubmit={renameHall}>
                <input className="input" value={hallDraft} onChange={(e) => setHallDraft(e.target.value)} aria-label={t.hallName} maxLength={60} autoFocus disabled={pending} />
                <button type="submit" className="btn btn-primary btn-sm" disabled={pending || !hallDraft.trim()}>{d.common.save}</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenaming(false)}>{d.common.cancel}</button>
              </form>
            ) : (
              <>
                <div className="rs-title-row">
                  <h2 className="rs-h" id="rs-hall-h">{hall.name}</h2>
                  <span className="rs-muted">{tr(t.hallTablesN, { n: tables.length })}</span>
                  {!hall.active && <span className="t-pill t-pill--warn">{d.common.inactive}</span>}
                </div>
                <div className="rs-actions">
                  {data.halls.length > 1 && (
                    <>
                      <button type="button" className="icon-btn" disabled={pending || hallIdx <= 0} onClick={() => moveHall(-1)} aria-label={`${t.hallUp}: ${hall.name}`} title={t.hallUp}>
                        <Icon name="arrowLeft" size={16} />
                      </button>
                      <button type="button" className="icon-btn" disabled={pending || hallIdx < 0 || hallIdx >= data.halls.length - 1} onClick={() => moveHall(1)} aria-label={`${t.hallDown}: ${hall.name}`} title={t.hallDown}>
                        <Icon name="arrowRight" size={16} />
                      </button>
                    </>
                  )}
                  <button type="button" className="icon-btn" onClick={() => { setHallDraft(hall.name); setRenaming(true); }} aria-label={`${t.renameHall}: ${hall.name}`} title={t.renameHall}>
                    <Icon name="edit" size={16} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    disabled={pending}
                    onClick={() => run(() => saveHallAction({ id: hall.id, name: hall.name, active: !hall.active }))}
                    title={t.inactiveHint}
                  >
                    {hall.active ? t.deactivate : t.activate}
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn--danger"
                    disabled={pending || tables.length > 0}
                    title={tables.length > 0 ? t.hallHasTablesHint : d.common.delete}
                    aria-label={`${d.common.delete}: ${hall.name}`}
                    onClick={() => {
                      if (confirm(tr(t.deleteHallConfirm, { name: hall.name }))) run(() => deleteHallAction(hall.id), { after: () => setHallId('') });
                    }}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Stol qo'shish: bittasi yoki oraliq */}
          <div className="rs-add-grid">
            <form className="rs-addbox" onSubmit={addTable} aria-labelledby="rs-add1-h">
              <span className="rs-label" id="rs-add1-h">{t.addTable}</span>
              <div className="rs-inline">
                <label className="rs-mini">
                  <span>{t.tableNumber}</span>
                  <input className="input" type="number" inputMode="numeric" min={1} max={RESTAURANT_LIMITS.maxTableNumber} value={num} placeholder={String(nextNumber)} onChange={(e) => setNum(e.target.value)} disabled={pending} />
                </label>
                <label className="rs-mini">
                  <span>{t.seats}</span>
                  <input className="input" type="number" inputMode="numeric" min={1} max={RESTAURANT_LIMITS.maxSeats} value={seats} onChange={(e) => setSeats(e.target.value)} disabled={pending} />
                </label>
                <button type="submit" className="btn btn-primary btn-sm rs-end" disabled={pending}>{d.common.add}</button>
              </div>
            </form>
            <form className="rs-addbox" onSubmit={addRange} aria-labelledby="rs-add2-h">
              <span className="rs-label" id="rs-add2-h">{t.rangeTitle}</span>
              <div className="rs-inline">
                <label className="rs-mini">
                  <span>{t.rangeFrom}</span>
                  <input className="input" type="number" inputMode="numeric" min={1} max={RESTAURANT_LIMITS.maxTableNumber} value={from} placeholder={String(nextNumber)} onChange={(e) => setFrom(e.target.value)} disabled={pending} />
                </label>
                <label className="rs-mini">
                  <span>{t.rangeTo}</span>
                  <input className="input" type="number" inputMode="numeric" min={1} max={RESTAURANT_LIMITS.maxTableNumber} value={to} placeholder={String(rangeToDefault)} onChange={(e) => setTo(e.target.value)} disabled={pending} aria-invalid={rTooBig} />
                </label>
                <label className="rs-mini">
                  <span>{t.seats}</span>
                  <input className="input" type="number" inputMode="numeric" min={1} max={RESTAURANT_LIMITS.maxSeats} value={rSeats} onChange={(e) => setRSeats(e.target.value)} disabled={pending} />
                </label>
                <button type="submit" className="btn btn-primary btn-sm rs-end" disabled={pending || !rangeOk}>{d.common.add}</button>
              </div>
              <small className={rTooBig ? 'rs-error' : 'rs-hint'} role={rTooBig ? 'alert' : undefined}>{rTooBig ? t.rangeTooBig : t.rangeHint}</small>
            </form>
          </div>

          {/* QR: chop etish yoki Pro tarif haqida */}
          {qrMenu ? (
            <div className="rs-qrbar">
              <span>
                <b>{t.qrCode}</b>
                <small>{t.printQrHint}</small>
              </span>
              {tables.some((x) => x.active) ? (
                <Link href={printHref} className="btn btn-sm btn-tinted btn-with-icon">
                  <Icon name="qr" size={15} /> {t.printQr}
                </Link>
              ) : (
                <span className="btn btn-sm btn-tinted" aria-disabled="true">{t.printQr}</span>
              )}
              {/* Stolsiz umumiy menyu (/m/<slug>): havola, QR va plakat — «Umumiy» tabida */}
              <Link href="/app/restaurant#rs-customer" className="btn btn-sm btn-ghost btn-with-icon" title={t.customerPageTablesHint}>
                <Icon name="globe" size={15} /> {t.customerPage}
              </Link>
            </div>
          ) : (
            <div className="rs-qrbar rs-qrbar--pro">
              <span>
                <b>{t.qrPro}</b>
                <small>{t.qrProHint}</small>
              </span>
              <Link href="/app/locked?m=qrMenu" className="btn btn-sm btn-ghost">{d.common.details}</Link>
            </div>
          )}

          {tables.length === 0 ? (
            <p className="rs-empty">{t.tablesEmpty}</p>
          ) : (
            <ul className="rs-tables">
              {tables.map((x) =>
                edit?.id === x.id ? (
                  <li key={x.id} className="rs-table is-editing">
                    <form className="rs-table-form" onSubmit={saveEdit} aria-label={t.editTable}>
                      <label className="rs-mini">
                        <span>{t.tableNumber}</span>
                        <input className="input" type="number" inputMode="numeric" min={1} max={RESTAURANT_LIMITS.maxTableNumber} value={edit.number} onChange={(e) => setEdit({ ...edit, number: e.target.value })} autoFocus disabled={pending} />
                      </label>
                      <label className="rs-mini">
                        <span>{t.seats}</span>
                        <input className="input" type="number" inputMode="numeric" min={1} max={RESTAURANT_LIMITS.maxSeats} value={edit.seats} onChange={(e) => setEdit({ ...edit, seats: e.target.value })} disabled={pending} />
                      </label>
                      {data.halls.length > 1 && (
                        <label className="rs-mini rs-mini--wide">
                          <span>{d.restaurant.common.hall}</span>
                          <select className="input" value={edit.hallId} onChange={(e) => setEdit({ ...edit, hallId: e.target.value })} disabled={pending}>
                            {data.halls.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                          </select>
                        </label>
                      )}
                      <div className="rs-table-form-actions">
                        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{d.common.save}</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(null)}>{d.common.cancel}</button>
                      </div>
                    </form>
                  </li>
                ) : (
                  <li key={x.id} className={`rs-table${x.active ? '' : ' is-off'}${x.busy ? ' is-busy' : ''}`}>
                    <div className="rs-table-top">
                      <b className="rs-table-n" aria-label={tr(d.restaurant.common.tableN, { n: x.number })}>{x.number}</b>
                      {x.busy && <span className="t-pill t-pill--ok">{t.busy}</span>}
                      {!x.active && <span className="t-pill t-pill--warn">{d.common.inactive}</span>}
                    </div>
                    <small className="rs-muted">{tr(t.seatsN, { n: x.seats })}</small>
                    <div className="rs-table-actions">
                      {qrMenu && (
                        <button type="button" className="icon-btn" onClick={() => setQrId(x.id)} aria-label={tr(t.qrTitle, { n: x.number })} title={t.qrCode}>
                          <Icon name="qr" size={16} />
                        </button>
                      )}
                      <button type="button" className="icon-btn" onClick={() => setEdit({ id: x.id, number: String(x.number), seats: String(x.seats), hallId: x.hallId })} aria-label={`${t.editTable}: ${x.number}`} title={t.editTable}>
                        <Icon name="edit" size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        disabled={pending || (x.busy && x.active)}
                        onClick={() => toggleTable(x)}
                        aria-label={`${x.active ? t.deactivate : t.activate}: ${tr(d.restaurant.common.tableN, { n: x.number })}`}
                        title={x.busy && x.active ? t.busyHint : x.active ? t.deactivate : t.activate}
                        aria-pressed={x.active}
                      >
                        <Icon name={x.active ? 'eye' : 'lock'} size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn icon-btn--danger"
                        disabled={pending || x.busy}
                        title={x.busy ? t.busyHint : d.common.delete}
                        aria-label={`${d.common.delete}: ${tr(d.restaurant.common.tableN, { n: x.number })}`}
                        onClick={() => {
                          if (confirm(tr(t.deleteTableConfirm, { n: x.number }))) run(() => deleteTableAction(x.id));
                        }}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </li>
                ),
              )}
            </ul>
          )}
          {data.halls.some((h) => !h.active) || tables.some((x) => !x.active) ? <p className="rs-hint">{t.inactiveHint}</p> : null}
        </section>
      )}

      {qrTable && (
        <QrDialog
          table={qrTable}
          pending={pending}
          onClose={() => setQrId(null)}
          onRegenerate={() => {
            if (confirm(t.regenerateConfirm)) run(() => regenerateTableQrAction(qrTable.id));
          }}
        />
      )}
    </div>
  );
}

/** Stol QR-kodi oynasi: rasm, manzil (nusxalash), almashtirish */
function QrDialog({ table, pending, onClose, onRegenerate }: { table: Table; pending: boolean; onClose: () => void; onRegenerate: () => void }) {
  const d = useDict();
  const t = d.restaurant.settings;
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  const title = tr(t.qrTitle, { n: table.number });

  return (
    <dialog
      ref={ref}
      className="rs-dialog"
      aria-labelledby="rs-qr-title"
      onClose={onClose}
      onClick={(e) => {
        // Fon bosilsa yopiladi
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      <div className="rs-dialog-in">
        <div className="rs-dialog-head">
          <h2 className="rs-h" id="rs-qr-title">{title}</h2>
          <button type="button" className="icon-btn" onClick={() => ref.current?.close()} aria-label={d.common.close}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="rs-dialog-qr">
          <QrCode value={table.qrUrl} alt={title} size={220} />
        </div>
        <div className="rs-url">
          <span className="rs-label">{t.qrLink}</span>
          <div className="rs-url-row">
            <code>{table.qrUrl}</code>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => {
                navigator.clipboard?.writeText(table.qrUrl).then(
                  () => toast(d.common.copied, 'success'),
                  () => toast(d.common.errorGeneric, 'error'),
                );
              }}
            >
              {d.common.copy}
            </button>
          </div>
        </div>
        <div className="rs-danger-zone">
          <p className="rs-hint">{t.regenerateHint}</p>
          <button type="button" className="btn btn-sm btn-danger" disabled={pending} onClick={onRegenerate}>
            <Icon name="repeat" size={15} /> {t.regenerateQr}
          </button>
        </div>
      </div>
    </dialog>
  );
}
