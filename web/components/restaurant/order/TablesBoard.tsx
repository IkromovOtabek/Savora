'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from '@/components/icons/Icon';
import { fmtMoney } from '@/lib/format';
import { toast } from '@/lib/toast';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { ackTableCallAction, openOrderAction } from '@/app/actions/restaurant';
import type { TablesBoard as Board, TableBoardRow } from '@/lib/restaurant/queries';
import type { OrderSummary } from '@/lib/restaurant/view';
import type { TableCallKind } from '@/lib/restaurant/types';
import { buildBills, linkedTakeaways, linkedTotals } from '@/lib/restaurant/bills';
import Modal, { QtyStepper } from './Modal';
import BillsList, { BillsSummaryBar, billTitle } from './BillsList';
import { ForTablePicker, pickTablesOf } from './OrderDialogs';
import { getJson, minutesSince, newClientId, useNow, usePolling } from './shared';

type Filter = 'all' | 'mine' | 'free';
/** Taxta ko'rinishi: stollar to'ri yoki ochiq hisoblar ro'yxati */
type View = 'tables' | 'bills';
/** Asosiy holat (rang) va diqqat belgisi (halqa + yorliq) */
type BaseState = 'free' | 'open' | 'precheck' | 'other';
type Alert = 'bill' | 'call' | 'qr' | null;

const POLL_MS = 4000;
const HALL_KEY = 'savora_tables_hall';
const FILTER_KEY = 'savora_tables_filter';
const VIEW_KEY = 'savora_tables_view';
const ORPHAN_HALL = '_';

function baseState(t: TableBoardRow): BaseState {
  if (!t.order) return 'free';
  if (!t.order.access) return 'other';
  return t.order.status === 'precheck' ? 'precheck' : 'open';
}

function alertOf(t: TableBoardRow): Alert {
  if (t.calls.billAt) return 'bill';
  if (t.calls.waiterAt) return 'call';
  if ((t.order?.counts?.pending ?? 0) > 0) return 'qr';
  return null;
}

/** «Mening stollarim»: o'z buyurtmam yoki ofitsanti yo'q (mijoz QR ochgan) stol */
function isMine(o: OrderSummary | null): boolean {
  return !!o && (o.mine || (!o.waiterId && o.access));
}

/**
 * Zal ko'rinishi (/app/tables): zal tablari, stollar grid'i (holat rangi, summa, ofitsant, daqiqa),
 * mijoz chaqiruvlari («Ko'rdim»), «Mening stollarim» filtri, saboy (ixtiyoriy — qaysi stol mehmonlariga).
 * «Hisoblar» ko'rinishi — barcha ko'rinadigan ochiq hisoblar (lib/restaurant/bills.ts): jamlama, pre-chek birinchi,
 * stolga bog'langan saboylar stol ostida. Polling 4 s — /api/restaurant/tables (sahifa yashirin bo'lsa to'xtaydi).
 */
export default function TablesBoard({ initial, serverNow, canCreate, canAck, canManage }: {
  initial: Board;
  /** Server vaqti (ms) — birinchi chizishda daqiqalar bir xil chiqsin */
  serverNow: number;
  /** order.create — stol ochish, saboy */
  canCreate: boolean;
  /** order.create yoki order.viewAll (kassir) — mijoz chaqiruvi / hisob so'rovini «Ko'rdim» */
  canAck: boolean;
  /** tables.manage — sozlamalarga havola */
  canManage: boolean;
}) {
  const d = useDict();
  const k = d.restaurant.tables;
  const c = d.restaurant.common;
  const router = useRouter();

  const [board, setBoard] = useState<Board>(initial);
  const [skew, setSkew] = useState(0);
  const [online, setOnline] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [hall, setHall] = useState<string>(initial.halls[0]?.id ?? ORPHAN_HALL);
  const [opening, setOpening] = useState<TableBoardRow | null>(null);
  const [acking, setAcking] = useState<string | null>(null);
  const [takeawayOpen, setTakeawayOpen] = useState(false);
  const [view, setView] = useState<View>('tables');
  const [announce, setAnnounce] = useState('');
  const now = useNow(serverNow, skew);

  // Qurilmada eslab qolingan zal, filtr va ko'rinish
  useEffect(() => {
    try {
      const h = localStorage.getItem(`${HALL_KEY}:${initial.branchId}`);
      if (h) setHall(h);
      const f = localStorage.getItem(FILTER_KEY);
      if (f === 'all' || f === 'mine' || f === 'free') setFilter(f);
      const v = localStorage.getItem(VIEW_KEY);
      if (v === 'tables' || v === 'bills') setView(v);
    } catch { /* xotira yopiq */ }
  }, [initial.branchId]);

  const pickView = useCallback((v: View) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* e'tiborsiz */ }
  }, []);

  const pickHall = useCallback((id: string) => {
    setHall(id);
    try { localStorage.setItem(`${HALL_KEY}:${board.branchId}`, id); } catch { /* e'tiborsiz */ }
  }, [board.branchId]);

  const pickFilter = useCallback((f: Filter) => {
    setFilter(f);
    try { localStorage.setItem(FILTER_KEY, f); } catch { /* e'tiborsiz */ }
  }, []);

  // Yangi chaqiruvlar — ekran o'quvchiga e'lon (va qurilma tebranishi)
  const seenCalls = useRef<Set<string>>(new Set(
    initial.tables.flatMap((t) => [t.calls.waiterAt ? `${t.id}:waiter` : '', t.calls.billAt ? `${t.id}:bill` : ''].filter(Boolean)),
  ));

  const apply = useCallback((next: Board) => {
    const fresh: string[] = [];
    const keys = new Set<string>();
    for (const t of next.tables) {
      for (const kind of ['waiter', 'bill'] as const) {
        const at = kind === 'waiter' ? t.calls.waiterAt : t.calls.billAt;
        if (!at) continue;
        const key = `${t.id}:${kind}`;
        keys.add(key);
        if (!seenCalls.current.has(key)) fresh.push(`${tr(c.tableN, { n: t.number })}: ${kind === 'bill' ? k.callBill : k.callWaiter}`);
      }
    }
    seenCalls.current = keys;
    if (fresh.length) {
      setAnnounce(fresh.join('. '));
      try { navigator.vibrate?.(180); } catch { /* qo'llanmaydi */ }
    }
    setBoard(next);
  }, [c.tableN, k.callBill, k.callWaiter]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const r = await getJson<Board>(`/api/restaurant/tables?branchId=${encodeURIComponent(board.branchId)}`, signal);
    if (r.ok) {
      setOnline(true);
      const st = Date.parse(r.data.serverTime);
      if (Number.isFinite(st)) setSkew(st - Date.now());
      apply(r.data);
    } else if (r.status === 401) {
      router.refresh();
    } else {
      setOnline(false);
    }
  }, [board.branchId, apply, router]);

  usePolling(refresh, POLL_MS);

  // Zallar (faol zalga tegishli bo'lmagan stollar — «Boshqa»)
  const halls = useMemo(() => {
    const ids = new Set(board.halls.map((h) => h.id));
    const list = board.halls.map((h) => ({ id: h.id, name: h.name }));
    if (board.tables.some((t) => !ids.has(t.hallId))) list.push({ id: ORPHAN_HALL, name: k.otherHall });
    return list;
  }, [board.halls, board.tables, k.otherHall]);
  const hallOf = useCallback((t: TableBoardRow) => (board.halls.some((h) => h.id === t.hallId) ? t.hallId : ORPHAN_HALL), [board.halls]);
  const activeHall = halls.some((h) => h.id === hall) ? hall : halls[0]?.id ?? ORPHAN_HALL;

  const inHall = board.tables.filter((t) => hallOf(t) === activeHall);
  const visible = inHall.filter((t) => filter === 'all' || (filter === 'free' ? !t.order : isMine(t.order)));
  const freeCount = board.tables.filter((t) => !t.order).length;
  const busyCount = board.tables.length - freeCount;
  // Stolga bog'langan saboylar (kartochkadagi belgi) va «Hisoblar» ro'yxati
  const linked = useMemo(() => linkedTakeaways(board), [board]);
  const bills = useMemo(() => buildBills(board), [board]);

  async function ack(t: TableBoardRow, kind: TableCallKind) {
    const key = `${t.id}:${kind}`;
    if (acking) return;
    setAcking(key);
    try {
      const r = await ackTableCallAction({ tableId: t.id, kind });
      if (r.ok) {
        setBoard((b) => ({
          ...b,
          tables: b.tables.map((x) => (x.id === t.id ? { ...x, calls: { ...x.calls, [kind === 'bill' ? 'billAt' : 'waiterAt']: null } } : x)),
        }));
        toast(r.success ?? d.restaurant.order.callAcked, 'success');
      } else {
        toast(r.error, 'error');
      }
    } catch {
      toast(d.restaurant.errors.failed, 'error');
    } finally {
      setAcking(null);
    }
  }

  function onTable(t: TableBoardRow) {
    if (t.order?.access) { router.push(`/app/tables/${t.order.id}`); return; }
    if (!t.order && canCreate) setOpening(t);
  }

  function ackBill(tableId: string) {
    const t = board.tables.find((x) => x.id === tableId);
    if (t) void ack(t, 'bill');
  }

  function changeBranch(id: string) {
    router.replace(`/app/tables?branch=${encodeURIComponent(id)}`);
  }

  // Zal tablari: ← → bilan almashish
  function onHallKey(e: React.KeyboardEvent<HTMLButtonElement>, i: number) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const n = halls.length;
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
    pickHall(halls[j].id);
    (e.currentTarget.parentElement?.children[j] as HTMLElement | undefined)?.focus();
  }

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: k.filterAll },
    { id: 'mine', label: k.filterMine },
    { id: 'free', label: k.free },
  ];

  return (
    <div className="rt-board">
      <header className="t-page-head rt-head">
        <div>
          <h1 className="t-page-title">{k.title}</h1>
          <p className="t-page-sub">
            {view === 'bills'
              ? tr(d.cashier.summaryLine, { n: bills.summary.count, sum: fmtMoney(bills.summary.due) })
              : tr(k.summary, { free: freeCount, busy: busyCount })}
            <span className={`rt-live${online ? '' : ' is-off'}`} role="status">
              <i aria-hidden="true" />{online ? k.live : k.offline}
            </span>
          </p>
        </div>
        <div className="t-page-actions rt-head-actions">
          {board.branches.length > 1 && (
            <select className="input rt-branch" value={board.branchId} onChange={(e) => changeBranch(e.target.value)} aria-label={k.branch}>
              {board.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          {canCreate && (
            <button type="button" className="btn btn-primary btn-with-icon rt-takeaway-btn" onClick={() => setTakeawayOpen(true)}>
              <Icon name="basket" size={18} />
              {k.newTakeaway}
            </button>
          )}
        </div>
      </header>

      <p className="sr-only" aria-live="assertive">{announce}</p>

      <div className="rt-viewbar">
        <div className="rt-seg" role="radiogroup" aria-label={d.cashier.viewAria}>
          <button type="button" role="radio" aria-checked={view === 'tables'} onClick={() => pickView('tables')}>{d.cashier.viewTables}</button>
          <button type="button" role="radio" aria-checked={view === 'bills'} onClick={() => pickView('bills')}>
            {d.cashier.viewBills}
            {bills.summary.count > 0 && <span className="rt-count">{bills.summary.count}</span>}
          </button>
        </div>
      </div>

      {view === 'bills' ? (
        <section className="rt-billsview" aria-label={d.cashier.billsAria}>
          <BillsSummaryBar summary={bills.summary} />
          {bills.rows.length === 0 ? (
            <div className="ux-empty rt-empty">
              <span className="ux-empty-ic" aria-hidden="true"><Icon name="clipboard" size={26} /></span>
              <b>{d.cashier.noBills}</b>
              <p className="rt-muted">{d.cashier.noBillsHint}</p>
            </div>
          ) : (
            <BillsList
              rows={bills.rows}
              now={now}
              label={d.cashier.billsAria}
              canAck={canAck}
              ackingTable={acking?.endsWith(':bill') ? acking.slice(0, -5) : null}
              onAck={ackBill}
            />
          )}
        </section>
      ) : board.tables.length === 0 ? (
        <div className="ux-empty rt-empty">
          <span className="ux-empty-ic" aria-hidden="true"><Icon name="grid" size={26} /></span>
          <b>{k.noHalls}</b>
          {canManage && <Link href="/app/restaurant" className="btn btn-tinted">{k.settingsLink}</Link>}
        </div>
      ) : (
        <>
          <div className="rt-bar">
            {halls.length > 1 && (
              <div className="rt-halls" role="tablist" aria-label={k.halls}>
                {halls.map((h, i) => {
                  const list = board.tables.filter((t) => hallOf(t) === h.id);
                  const busy = list.filter((t) => t.order).length;
                  const hot = list.some((t) => alertOf(t) === 'bill' || alertOf(t) === 'call');
                  return (
                    <button
                      key={h.id}
                      type="button"
                      role="tab"
                      id={`rt-hall-${h.id}`}
                      aria-selected={activeHall === h.id}
                      aria-controls="rt-tables"
                      tabIndex={activeHall === h.id ? 0 : -1}
                      className="rt-hall"
                      onClick={() => pickHall(h.id)}
                      onKeyDown={(e) => onHallKey(e, i)}
                    >
                      {h.name}
                      <small>{busy}/{list.length}</small>
                      {hot && <i className="rt-hall-dot" aria-label={k.hasCalls} />}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="rt-seg" role="radiogroup" aria-label={k.filterAria}>
              {filters.map((f) => (
                <button key={f.id} type="button" role="radio" aria-checked={filter === f.id} onClick={() => pickFilter(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div id="rt-tables" role={halls.length > 1 ? 'tabpanel' : undefined} aria-labelledby={halls.length > 1 ? `rt-hall-${activeHall}` : undefined}>
            {visible.length === 0 ? (
              <p className="rt-muted rt-none">{inHall.length === 0 ? k.noTablesInHall : k.noMatch}</p>
            ) : (
              <ul className="rt-grid">
                {visible.map((t) => (
                  <TableCard
                    key={t.id}
                    t={t}
                    now={now}
                    canCreate={canCreate}
                    canAck={canAck}
                    acking={acking}
                    linked={linkedTotals(linked.get(t.id))}
                    onOpen={() => onTable(t)}
                    onAck={(kind) => ack(t, kind)}
                  />
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {view === 'tables' && board.takeaway.length > 0 && (
        <section className="rt-takeaway" aria-labelledby="rt-tk-title">
          <h2 id="rt-tk-title" className="rt-h2">{k.takeawayList} <span className="rt-count">{board.takeaway.length}</span></h2>
          <ul className="rt-grid rt-grid--tk">
            {board.takeaway.map((o) => {
              const mins = minutesSince(o.openedAt, now);
              return (
                <li key={o.id} className="rt-table" data-state={o.status === 'precheck' ? 'precheck' : 'open'}>
                  <Link href={`/app/tables/${o.id}`} className="rt-table-main" aria-label={billTitle(o, d)}>
                    <span className="rt-table-top">
                      <b className="rt-table-no rt-table-no--sm">{o.orderNo.split('-').pop()}</b>
                      <span className="rt-pill">{c.orderStatuses[o.status]}</span>
                    </span>
                    <span className="rt-table-sum">{fmtMoney(o.due ?? 0)} <small>{d.common.sum}</small></span>
                    <span className="rt-table-meta">
                      {o.forTableNumber !== null && <span className="rt-table-for"><Icon name="grid" size={13} />{tr(c.tableN, { n: o.forTableNumber })}</span>}
                      <span><Icon name="user" size={13} />{o.mine ? k.mine : o.waiterName ?? '—'}</span>
                      {mins !== null && <span><Icon name="clock" size={13} />{tr(c.minutes, { n: mins })}</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {view === 'tables' && board.tables.length > 0 && (
        <ul className="rt-legend" aria-label={k.legend}>
          <li data-state="free">{k.free}</li>
          <li data-state="open">{k.legendOpen}</li>
          <li data-state="precheck">{k.precheck}</li>
          <li data-alert="call">{k.legendCall}</li>
          <li data-alert="qr">{k.legendQr}</li>
          <li data-state="other">{k.legendOther}</li>
        </ul>
      )}

      {opening && (
        <OpenTableDialog
          table={opening}
          onClose={() => setOpening(null)}
          onOpened={(id) => router.push(`/app/tables/${id}`)}
          onBusy={() => { setOpening(null); void refresh(); }}
        />
      )}
      {takeawayOpen && (
        <NewTakeawayDialog
          board={board}
          onClose={() => setTakeawayOpen(false)}
          onOpened={(id) => router.push(`/app/tables/${id}`)}
          onStale={() => void refresh()}
        />
      )}
    </div>
  );
}

function TableCard({ t, now, canCreate, canAck, acking, linked, onOpen, onAck }: {
  t: TableBoardRow;
  now: number;
  canCreate: boolean;
  canAck: boolean;
  acking: string | null;
  /** Shu stol mehmonlariga ochiq saboylar (ko'rinadiganlari): soni va summa */
  linked: { count: number; due: number } | null;
  onOpen: () => void;
  onAck: (kind: TableCallKind) => void;
}) {
  const d = useDict();
  const k = d.restaurant.tables;
  const c = d.restaurant.common;
  const o = t.order;
  const state = baseState(t);
  const alert = alertOf(t);
  const mins = o ? minutesSince(o.openedAt, now) : null;
  const label = state === 'free' ? k.free : state === 'other' ? k.busy : c.orderStatuses[o!.status];
  const disabled = state === 'other' || (state === 'free' && !canCreate);
  const calls = ([['waiter', t.calls.waiterAt], ['bill', t.calls.billAt]] as const).filter(([, at]) => !!at);
  const counts = o?.counts;
  const name = tr(c.tableN, { n: t.number });
  const linkedText = linked ? tr(k.linkedN, { n: linked.count, sum: fmtMoney(linked.due) }) : '';

  return (
    <li className="rt-table" data-state={state} data-alert={alert ?? undefined} data-mine={isMine(o) || undefined}>
      <button
        type="button"
        className="rt-table-main"
        onClick={onOpen}
        disabled={disabled}
        aria-label={`${name}, ${label}${o?.access && o.due !== null ? `, ${fmtMoney(o.due)} ${d.common.sum}` : ''}${linkedText ? `, ${linkedText}` : ''}`}
        title={state === 'other' ? k.otherWaiter : undefined}
      >
        <span className="rt-table-top">
          <b className="rt-table-no">{t.number}</b>
          <span className="rt-pill">{label}</span>
        </span>
        {o && o.access ? (
          <>
            <span className="rt-table-sum">{fmtMoney(o.due ?? 0)} <small>{d.common.sum}</small></span>
            <span className="rt-table-meta">
              <span><Icon name="user" size={13} />{o.mine ? k.mine : o.waiterName ?? k.noWaiter}</span>
              {mins !== null && <span><Icon name="clock" size={13} />{tr(c.minutes, { n: mins })}</span>}
              {o.guests ? <span><Icon name="users" size={13} />{o.guests}</span> : null}
            </span>
            {counts && (counts.pending > 0 || counts.ready > 0 || counts.unsent > 0) && (
              <span className="rt-table-tags">
                {counts.pending > 0 && <span className="rt-tag rt-tag--qr">{tr(k.pendingQrN, { n: counts.pending })}</span>}
                {counts.ready > 0 && <span className="rt-tag rt-tag--ready">{tr(k.readyN, { n: counts.ready })}</span>}
                {counts.unsent > 0 && <span className="rt-tag">{tr(k.unsentN, { n: counts.unsent })}</span>}
              </span>
            )}
          </>
        ) : o ? (
          <span className="rt-table-meta">
            <span><Icon name="lock" size={13} />{o.waiterName ?? k.noWaiter}</span>
            {mins !== null && <span><Icon name="clock" size={13} />{tr(c.minutes, { n: mins })}</span>}
          </span>
        ) : (
          <span className="rt-table-meta">
            <span><Icon name="users" size={13} />{tr(k.seatsN, { n: t.seats })}</span>
            {canCreate && <span className="rt-table-cta"><Icon name="plus" size={13} />{k.openTable}</span>}
          </span>
        )}
        {/* Kartochka belgilari: shu stol mehmonlariga ochiq saboy (boshqa belgilar ham shu qatorga) */}
        {linked && (
          <span className="rt-table-badges">
            <span className="rt-tag rt-tag--tk"><Icon name="basket" size={12} />{linkedText}</span>
          </span>
        )}
      </button>
      {calls.map(([kind]) => (
        <div key={kind} className="rt-call" data-kind={kind}>
          <Icon name="bell" size={15} />
          <span>{kind === 'bill' ? k.callBill : k.callWaiter}</span>
          {canAck && (
            <button type="button" onClick={() => onAck(kind)} disabled={acking === `${t.id}:${kind}`} aria-label={`${k.ack}: ${name}`}>
              {k.ack}
            </button>
          )}
        </div>
      ))}
    </li>
  );
}

/** Stolni ochish: mehmonlar soni (ixtiyoriy) → buyurtma ekrani */
function OpenTableDialog({ table, onClose, onOpened, onBusy }: {
  table: TableBoardRow;
  onClose: () => void;
  onOpened: (orderId: string) => void;
  onBusy: () => void;
}) {
  const d = useDict();
  const k = d.restaurant.tables;
  const o = d.restaurant.order;
  const [guests, setGuests] = useState(0);
  const [busy, setBusy] = useState(false);
  // Takror bosish / tarmoq uzilishidan himoya — bitta oynada bitta kalit
  const [clientOrderId] = useState(() => newClientId('tb'));

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await openOrderAction({ type: 'dine_in', tableId: table.id, guests: guests || undefined, clientOrderId });
      if (r.ok) { onOpened(r.data.order.id); return; }
      toast(r.error, 'error');
      setBusy(false);
      if (r.code === 'tableBusy' || r.code === 'tableNotFound') onBusy();
    } catch {
      toast(d.restaurant.errors.failed, 'error');
      setBusy(false);
    }
  }

  return (
    <Modal
      title={tr(k.openTitle, { n: table.number })}
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>{d.common.cancel}</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy} data-autofocus>
            {busy ? d.common.loading : k.openTable}
          </button>
        </>
      )}
    >
      <form className="rt-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <p className="rt-label" id="rt-guests-l">{k.guestsQ} <small>{d.common.optional}</small></p>
        <div className="rt-chips" role="radiogroup" aria-labelledby="rt-guests-l">
          {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={guests === n} className="rt-chip" onClick={() => setGuests(guests === n ? 0 : n)}>
              {n}
            </button>
          ))}
        </div>
        <QtyStepper
          value={guests}
          onChange={setGuests}
          min={0}
          max={100}
          label={d.restaurant.common.guests}
          decLabel={o.qtyDec}
          incLabel={o.qtyInc}
        />
        <p className="rt-muted rt-small">{tr(k.seatsN, { n: table.seats })}</p>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/**
 * Yangi saboy: ixtiyoriy — qaysi stol mehmonlariga (band stol ham bo'ladi; stol bandligiga ta'sir qilmaydi).
 * Standart «Stolsiz» — bitta bosish bilan ochiladi.
 */
function NewTakeawayDialog({ board, onClose, onOpened, onStale }: {
  board: Board;
  onClose: () => void;
  onOpened: (orderId: string) => void;
  /** Stol topilmadi (o'chirilgan/nofaol) — taxta yangilansin */
  onStale: () => void;
}) {
  const d = useDict();
  const k = d.restaurant.tables;
  const [tableId, setTableId] = useState('');
  const [busy, setBusy] = useState(false);
  // Takror bosish / tarmoq uzilishidan himoya — bitta oynada bitta kalit (stol o'zgarsa — yangi kalit)
  const [clientOrderId, setClientOrderId] = useState(() => newClientId('tk'));
  const tables = useMemo(() => pickTablesOf(board), [board]);

  function pick(id: string) {
    setTableId(id);
    setClientOrderId(newClientId('tk'));
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await openOrderAction({ type: 'takeaway', branchId: board.branchId, clientOrderId, forTableId: tableId || undefined });
      if (r.ok) { onOpened(r.data.order.id); return; }
      toast(r.error, 'error');
      setBusy(false);
      if (r.code === 'tableNotFound') { setTableId(''); onStale(); }
    } catch {
      toast(d.restaurant.errors.failed, 'error');
      setBusy(false);
    }
  }

  return (
    <Modal
      title={k.newTakeawayTitle}
      onClose={onClose}
      busy={busy}
      wide
      footer={(
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>{d.common.cancel}</button>
          <button type="button" className="btn btn-primary btn-with-icon" onClick={submit} disabled={busy} data-autofocus>
            <Icon name="basket" size={18} />
            {busy ? d.common.loading : k.openTakeaway}
          </button>
        </>
      )}
    >
      <form className="rt-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <p className="rt-label" id="rt-tk-for">{k.forTableQ} <small>{d.common.optional}</small></p>
        <p className="rt-muted rt-small">{k.forTableHint}</p>
        {tables.length > 0 && (
          <ForTablePicker tables={tables} halls={board.halls} value={tableId} onChange={pick} labelledBy="rt-tk-for" />
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
