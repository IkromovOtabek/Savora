'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { toast } from '@/lib/toast';
import { fmtMoney } from '@/lib/format';
import type { MenuItemView } from '@/lib/restaurant/queries';
import {
  DURATION_PRESETS, GUEST_PRESETS, MINUTE_STEPS, RESERVATION_LIMITS, addDays, fmtTime, parseTime, tashkentClock,
} from '@/lib/restaurant/reservationRules';
import type { FreeTable, ReservationCustomerHit, ReservationForm as FormData, ReservationView } from '@/lib/restaurant/reservations';
import {
  createReservationAction, reservationFreeTablesAction, searchReservationCustomersAction, updateReservationAction,
} from '@/app/actions/reservations';
import { useRun } from '@/components/restaurant/settings/useRun';
import Modal, { QtyStepper } from '@/components/restaurant/order/Modal';
import { dishOff } from '@/components/restaurant/order/MenuPanel';
import { newClientId } from '@/components/restaurant/order/shared';

interface Line { key: string; productId: string; name: string; qty: number; note: string; optionIds: string[] }

const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** Yangi bron uchun boshlang'ich vaqt: bugun — keyingi choraqdan 30 daqiqa keyin (Toshkent), boshqa kun — 19:00 */
function defaultMinutes(date: string, today: string): number {
  if (date !== today) return 19 * 60;
  const [h, m] = tashkentClock(new Date()).split(':').map(Number);
  return Math.min(23 * 60 + 45, Math.ceil((h * 60 + m) / 15) * 15 + 30);
}

/**
 * Bron oynasi (yangi / tahrir): mijoz (ism yoki telefon yozilganda mavjud mijozlar taklif qilinadi), sana, vaqt (soat
 * tugmalari + 15 daqiqa), davomiylik, mehmonlar, shu vaqtda bo'sh stollar (mosi birinchi), oldindan taomlar (qidiruvli
 * menyu, soni ±, modifikator, izoh), izoh. Server — app/actions/reservations.ts.
 */
export default function ReservationForm({ form, date: listDate, today, editing, onClose, onSaved }: {
  form: FormData;
  date: string;
  today: string;
  editing: ReservationView | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const d = useDict();
  const t = d.reservations;
  const f = t.form;
  const { pending, run } = useRun();

  const startDate = editing?.day ?? (listDate < today ? today : listDate);
  const [date, setDate] = useState(startDate);
  const [minutes, setMinutes] = useState(() => (editing ? parseTime(editing.time) ?? 19 * 60 : defaultMinutes(startDate, today)));
  const [duration, setDuration] = useState(editing?.durationMin ?? RESERVATION_LIMITS.defaultDurationMin);
  const [guests, setGuests] = useState(editing?.guests ?? 2);
  const [tableId, setTableId] = useState(editing?.tableId ?? '');
  const [customerId, setCustomerId] = useState(editing?.customerId ?? '');
  const [name, setName] = useState(editing?.customerName ?? '');
  const [phone, setPhone] = useState(editing?.customerPhone ?? '');
  const [note, setNote] = useState(editing?.note ?? '');
  const [lines, setLines] = useState<Line[]>(() => (editing?.items ?? []).map((i) => ({
    key: newClientId('l'), productId: i.productId, name: i.name, qty: i.qty, note: i.note ?? '', optionIds: i.optionIds,
  })));
  const menuById = useMemo(() => new Map(form.menu.items.map((i) => [i.id, i])), [form.menu.items]);

  /* ───── bo'sh stollar (sana/vaqt/davomiylik/mehmon o'zgarganda) ───── */
  const [free, setFree] = useState<FreeTable[] | null>(null);
  const [freeErr, setFreeErr] = useState('');
  const time = fmtTime(minutes);
  useEffect(() => {
    let alive = true;
    setFree(null);
    setFreeErr('');
    const timer = setTimeout(async () => {
      try {
        const r = await reservationFreeTablesAction({ branchId: form.branchId, date, time, durationMin: duration, guests, excludeId: editing?.id });
        if (!alive) return;
        if (r.ok) {
          setFree(r.data);
          setTableId((cur) => (cur && !r.data.some((x) => x.id === cur) ? '' : cur));
        } else setFreeErr(r.error);
      } catch {
        if (alive) setFreeErr(d.common.errorGeneric);
      }
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [date, time, duration, guests, form.branchId, editing?.id, d.common.errorGeneric]);

  /* ───── mijoz takliflari ───── */
  const [hits, setHits] = useState<ReservationCustomerHit[]>([]);
  const [searching, setSearching] = useState(false);
  const digits = phone.replace(/\D/g, '');
  const query = customerId ? '' : digits.replace(/^998/, '').length >= 3 ? phone : name.trim().length >= 2 ? name.trim() : '';
  useEffect(() => {
    if (!query) { setHits([]); return; }
    let alive = true;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const r = await searchReservationCustomersAction(query);
        if (alive) setHits(r.ok ? r.data : []);
      } catch {
        if (alive) setHits([]);
      } finally {
        if (alive) setSearching(false);
      }
    }, 300);
    return () => { alive = false; clearTimeout(timer); setSearching(false); };
  }, [query]);

  function pick(c: ReservationCustomerHit) {
    setCustomerId(c.id);
    setName(c.name);
    setPhone(c.phone);
    setHits([]);
  }

  /* ───── taomlar ───── */
  const [menuOpen, setMenuOpen] = useState(false);
  const [mq, setMq] = useState('');
  const shown = useMemo(() => {
    const q = mq.trim().toLowerCase();
    return form.menu.items.filter((i) => !q || i.name.toLowerCase().includes(q)).slice(0, 60);
  }, [form.menu.items, mq]);

  function addDish(i: MenuItemView) {
    setLines((ls) => {
      if (ls.length >= RESERVATION_LIMITS.maxItems) return ls;
      if (!i.modifierGroups.length) {
        const same = ls.find((l) => l.productId === i.id && !l.optionIds.length && !l.note);
        if (same) return ls.map((l) => (l === same ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...ls, { key: newClientId('l'), productId: i.id, name: i.name, qty: 1, note: '', optionIds: [] }];
    });
  }
  const patch = (key: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));

  function toggleOption(l: Line, group: MenuItemView['modifierGroups'][number], optionId: string) {
    const inGroup = new Set(group.options.map((o) => o.id));
    const on = l.optionIds.includes(optionId);
    let next = l.optionIds;
    if (on) next = next.filter((x) => x !== optionId);
    else if (Math.max(1, group.max) === 1) next = [...next.filter((x) => !inGroup.has(x)), optionId];
    else if (next.filter((x) => inGroup.has(x)).length < Math.max(1, group.max)) next = [...next, optionId];
    patch(l.key, { optionIds: next });
  }

  /* ───── saqlash ───── */
  const selected = free?.find((x) => x.id === tableId) ?? null;
  function submit() {
    if (pending) return;
    if (!customerId && (!name.trim() || !phone.trim())) { toast(f.needCustomer, 'error'); return; }
    if (!tableId) { toast(f.needTable, 'error'); return; }
    const payload = {
      branchId: form.branchId,
      tableId,
      date,
      time,
      durationMin: duration,
      guests,
      customerId: customerId || undefined,
      customerName: name.trim(),
      customerPhone: phone.trim(),
      items: lines.map((l) => ({ productId: l.productId, qty: l.qty, optionIds: l.optionIds, note: l.note.trim() })),
      note: note.trim(),
    };
    run(() => (editing ? updateReservationAction(editing.id, payload) : createReservationAction(payload)), { refresh: false, after: onSaved });
  }

  const durLabel = (m: number) => (m % 60 === 0 ? tr(f.durH, { h: m / 60 }) : tr(f.durHM, { h: Math.floor(m / 60), m: m % 60 }));
  const hourRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    hourRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, []);
  const multiHall = form.halls.length > 1;

  return (
    <Modal
      wide
      title={editing ? f.editTitle : f.newTitle}
      busy={pending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>{d.common.cancel}</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={pending}>{pending ? d.common.saving : f.save}</button>
        </>
      )}
    >
      <form className="rsv-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {/* Mijoz */}
        <div className="rsv-sec">
          <span className="rt-label">{f.customer}</span>
          {customerId ? (
            <div className="rsv-picked">
              <div>
                <b>{name}</b>
                <small>{phone}</small>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setCustomerId(''); setName(''); setPhone(''); }}>{f.change}</button>
            </div>
          ) : (
            <>
              <div className="rsv-two">
                <label>
                  <span className="rt-label">{f.name}</span>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={RESERVATION_LIMITS.nameMax} placeholder={f.namePh} autoComplete="off" data-autofocus />
                </label>
                <label>
                  <span className="rt-label">{f.phone}</span>
                  <input className="input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={RESERVATION_LIMITS.phoneMax} autoComplete="off" />
                </label>
              </div>
              {hits.length > 0 ? (
                <ul className="rsv-hits" aria-label={f.picked}>
                  {hits.map((c) => (
                    <li key={c.id}>
                      <button type="button" className="rsv-hit" onClick={() => pick(c)}>
                        <span>{c.name}</span>
                        <small>{c.phone}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rt-muted rt-small">{searching ? f.searching : query ? f.noCustomers : f.newCustomerHint}</p>
              )}
            </>
          )}
        </div>

        {/* Sana va vaqt */}
        <div className="rsv-sec">
          <span className="rt-label">{f.date}</span>
          <div className="rsv-when">
            <div className="rt-seg" role="radiogroup" aria-label={f.date}>
              <button type="button" role="radio" aria-checked={date === today} onClick={() => setDate(today)}>{t.today}</button>
              <button type="button" role="radio" aria-checked={date === addDays(today, 1)} onClick={() => setDate(addDays(today, 1))}>{t.tomorrow}</button>
            </div>
            <input type="date" className="input rsv-date" value={date} min={today} aria-label={f.date} onChange={(e) => { if (e.target.value) setDate(e.target.value); }} />
          </div>
        </div>
        <div className="rsv-sec">
          <span className="rt-label">{f.time} <small>{time}</small></span>
          <div className="rsv-hours" ref={hourRef} role="radiogroup" aria-label={f.hour}>
            {HOURS.map((h) => (
              <button key={h} type="button" role="radio" className="rt-chip" aria-checked={Math.floor(minutes / 60) === h} onClick={() => setMinutes(h * 60 + (minutes % 60))}>
                {String(h).padStart(2, '0')}
              </button>
            ))}
          </div>
          <div className="rt-seg" role="radiogroup" aria-label={f.minute}>
            {MINUTE_STEPS.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={minutes % 60 === m} onClick={() => setMinutes(Math.floor(minutes / 60) * 60 + m)}>
                :{String(m).padStart(2, '0')}
              </button>
            ))}
          </div>
        </div>
        <div className="rsv-sec">
          <span className="rt-label">{f.duration}</span>
          <div className="rt-chips" role="radiogroup" aria-label={f.duration}>
            {DURATION_PRESETS.map((m) => (
              <button key={m} type="button" role="radio" className="rt-chip" aria-checked={duration === m} onClick={() => setDuration(m)}>{durLabel(m)}</button>
            ))}
          </div>
        </div>
        <div className="rsv-sec">
          <span className="rt-label">{f.guests}</span>
          <div className="rt-chips" role="radiogroup" aria-label={f.guests}>
            {GUEST_PRESETS.map((n) => (
              <button key={n} type="button" role="radio" className="rt-chip" aria-checked={guests === n} onClick={() => setGuests(n)}>{n}</button>
            ))}
          </div>
          <QtyStepper value={guests} onChange={setGuests} min={1} max={RESERVATION_LIMITS.maxGuests} label={f.guests} decLabel={f.guestsDec} incLabel={f.guestsInc} />
        </div>

        {/* Stol */}
        <div className="rsv-sec">
          <span className="rt-label" id="rsv-tables">{f.table} <small>{tr(f.tableFor, { time: `${time}–${fmtTime((minutes + duration) % 1440)}` })}</small></span>
          {freeErr ? <p className="rt-bad" role="alert">{freeErr}</p>
            : !free ? <p className="rt-muted">{f.tablesLoading}</p>
            : free.length === 0 ? <p className="rt-hint rt-hint--warn">{f.noFreeTables}</p>
            : (
              <div className="rt-chips rt-chips--tables" role="radiogroup" aria-labelledby="rsv-tables">
                {free.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    role="radio"
                    aria-checked={tableId === x.id}
                    className={`rt-chip rt-chip--table${x.fits ? '' : ' rsv-chip-off'}`}
                    onClick={() => setTableId(tableId === x.id ? '' : x.id)}
                    aria-label={`${tr(t.tableN, { n: x.number })}, ${tr(f.seatsN, { n: x.seats })}${x.hallName && multiHall ? `, ${x.hallName}` : ''}`}
                  >
                    <b>{x.number}</b>
                    <small>{tr(f.seatsN, { n: x.seats })}{multiHall && x.hallName ? ` · ${x.hallName}` : ''}</small>
                    {x.busyNow ? <span className="rsv-chip-tag">{f.busyNow}</span> : !x.fits ? <span className="rsv-chip-tag">{f.tooSmall}</span> : null}
                  </button>
                ))}
              </div>
            )}
          {selected && !selected.fits && <p className="rt-hint rt-hint--warn">{f.smallWarn}</p>}
        </div>

        {/* Oldindan taomlar */}
        <div className="rsv-sec">
          <span className="rt-label">{f.items} <small>{f.itemsHint}</small></span>
          {lines.length > 0 && (
            <ul className="rsv-lines">
              {lines.map((l) => {
                const item = menuById.get(l.productId);
                return (
                  <li key={l.key} className="rsv-line">
                    <div className="rsv-line-top">
                      <b>{l.name}</b>
                      <QtyStepper value={l.qty} onChange={(n) => patch(l.key, { qty: n })} min={1} max={99} label={l.name} decLabel={f.qtyDec} incLabel={f.qtyInc} />
                      <button type="button" className="rsv-x" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={`${f.remove}: ${l.name}`}>
                        <Icon name="trash" size={18} />
                      </button>
                    </div>
                    {item?.modifierGroups.map((g) => {
                      const n = l.optionIds.filter((x) => g.options.some((o) => o.id === x)).length;
                      const bad = g.required && n < Math.max(1, g.min);
                      return (
                        <div key={g.id} className="rsv-mgroup" data-bad={bad || undefined}>
                          <span>{tr(f.pickOptions, { group: g.name })}</span>
                          <div className="rt-chips">
                            {g.options.map((o) => (
                              <button key={o.id} type="button" className="rt-chip" aria-pressed={l.optionIds.includes(o.id)} onClick={() => toggleOption(l, g, o.id)}>
                                {o.name}{o.price ? ` +${fmtMoney(o.price)}` : ''}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    <input className="input" value={l.note} onChange={(e) => patch(l.key, { note: e.target.value })} maxLength={200} placeholder={f.itemNotePh} aria-label={`${l.name}: ${f.itemNotePh}`} />
                  </li>
                );
              })}
            </ul>
          )}
          {menuOpen ? (
            <div className="rsv-menu">
              <label className="rt-search">
                <Icon name="search" size={18} />
                <input type="search" value={mq} onChange={(e) => setMq(e.target.value)} placeholder={f.menuSearchPh} aria-label={f.menuSearchPh} autoFocus />
              </label>
              {shown.length === 0 ? <p className="rt-muted">{f.noDishes}</p> : (
                <ul className="rsv-dishes">
                  {shown.map((i) => {
                    const off = dishOff(i);
                    return (
                      <li key={i.id}>
                        <button type="button" className="rsv-dish" disabled={!!off || lines.length >= RESERVATION_LIMITS.maxItems} onClick={() => addDish(i)}>
                          <span>{i.name}</span>
                          <small>{off === 'stop' ? f.stop : off === 'out' ? f.soldOut : fmtMoney(i.price)}</small>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setMenuOpen(false); setMq(''); }}>{f.hideMenu}</button>
            </div>
          ) : (
            <button type="button" className="btn btn-tinted btn-with-icon" onClick={() => setMenuOpen(true)}>
              <Icon name="plus" size={16} />
              {f.addDish}
            </button>
          )}
        </div>

        {/* Izoh */}
        <div className="rsv-sec">
          <label className="rt-label" htmlFor="rsv-note">{f.note} <small>{d.common.optional}</small></label>
          <textarea id="rsv-note" className="text-area" rows={2} maxLength={RESERVATION_LIMITS.noteMax} value={note} onChange={(e) => setNote(e.target.value)} placeholder={f.notePh} />
        </div>
      </form>
    </Modal>
  );
}
