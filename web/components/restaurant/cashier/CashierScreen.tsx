'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from '@/components/icons/Icon';
import { fmtMoney } from '@/lib/format';
import { toast } from '@/lib/toast';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { fmtQty } from '@/lib/qty';
import { ackTableCallAction, precheckOrderAction } from '@/app/actions/restaurant';
import type { TablesBoard } from '@/lib/restaurant/queries';
import type { OrderView } from '@/lib/restaurant/view';
import type { SendFailure } from '@/lib/restaurant/ops';
import type { ActionResult } from '@/lib/restaurant/session';
import { billMatches, buildBills } from '@/lib/restaurant/bills';
import BillsList, { BillsSummaryBar, billTitle } from '../order/BillsList';
import PayDialog from '../order/PayDialog';
import type { Runner } from '../order/OrderDialogs';
import { getJson, hhmm, isTyping, minutesSince, useNow, usePolling } from '../order/shared';

const BOARD_POLL_MS = 4000;
const ORDER_POLL_MS = 3000;
/** Server action shuncha vaqtda javob bermasa — tugma qotib qolmaydi, hisob qayta o'qiladi (OrderScreen bilan bir xil) */
const ACTION_TIMEOUT_MS = 25_000;
const REFETCH_CODES = new Set(['conflict', 'orderClosed', 'orderLocked', 'notPrecheck', 'itemNotFound', 'itemPaid', 'pendingItems', 'sendFailed']);

/**
 * Kassir oynasi (/app/tables/cashier): chapda — to'lov navbati (pre-chek va QR'dan «hisob so'radi» birinchi, keyin
 * eng eskisi; stol/saboy raqami bo'yicha qidiruv; stolga bog'langan saboylar stol ostida), o'ngda — tanlangan hisob:
 * taomlar, oraliq summa, xizmat haqi, qadoq, jami; «To'lash» — PayDialog (bo'lib to'lash, usullar, qaytim, chek),
 * «Pre-chek» — mavjud pre-chek varag'i. To'langach hisob navbatdan chiqadi (stol bo'shaydi).
 * Ma'lumot: /api/restaurant/tables (4 s) va /api/restaurant/orders/:id (3 s); sahifa yashirin bo'lsa to'xtaydi.
 */
export default function CashierScreen({ initial, serverNow, noShift, canShift, canAck, shopName }: {
  initial: TablesBoard;
  serverNow: number;
  /** Kassa moduli yoqiq, lekin filialda ochiq smena yo'q */
  noShift: boolean;
  /** Smenalar sahifasiga havola (kassa.view) */
  canShift: boolean;
  /** Hisob so'rovini «Ko'rdim» (order.create | order.viewAll) */
  canAck: boolean;
  shopName: string;
}) {
  const d = useDict();
  const k = d.cashier;
  const ok = d.restaurant.order;
  const c = d.restaurant.common;
  const router = useRouter();

  const [board, setBoard] = useState<TablesBoard>(initial);
  const [online, setOnline] = useState(true);
  const [skew, setSkew] = useState(0);
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [order, setOrderRaw] = useState<OrderView | null>(null);
  const [lost, setLost] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [failed, setFailed] = useState<SendFailure[]>([]);
  const [printKey, setPrintKey] = useState(0);
  const [ackingTable, setAckingTable] = useState<string | null>(null);
  const now = useNow(serverNow, skew);

  const selRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);

  /** Server javobi asosiy: shu hisobning faqat yangiroq (`rev` katta yoki teng) ko'rinishi qabul qilinadi */
  const setOrder = useCallback((next: OrderView) => {
    if (next.id !== selRef.current) return;
    setOrderRaw((cur) => (!cur || cur.id !== next.id || next.rev >= cur.rev ? next : cur));
  }, []);

  const refreshBoard = useCallback(async (signal?: AbortSignal) => {
    const r = await getJson<TablesBoard>(`/api/restaurant/tables?branchId=${encodeURIComponent(board.branchId)}`, signal);
    if (r.ok) {
      setOnline(true);
      const st = Date.parse(r.data.serverTime);
      if (Number.isFinite(st)) setSkew(st - Date.now());
      setBoard(r.data);
    } else if (r.status === 401) {
      router.refresh();
    } else {
      setOnline(false);
    }
  }, [board.branchId, router]);
  usePolling(refreshBoard, BOARD_POLL_MS);

  const fetchOrder = useCallback(async (signal?: AbortSignal) => {
    const id = selRef.current;
    if (!id) return;
    const r = await getJson<{ order: OrderView }>(`/api/restaurant/orders/${id}`, signal);
    if (selRef.current !== id) return;
    if (r.ok) { setLost(false); setOrder(r.data.order); return; }
    if (r.status === 401) { router.refresh(); return; }
    if (r.status === 404) setLost(true);
  }, [setOrder, router]);
  usePolling(fetchOrder, ORDER_POLL_MS, !!selId);

  function select(id: string | null) {
    if (busyRef.current) return;
    selRef.current = id;
    setSelId(id);
    setOrderRaw(null);
    setLost(false);
    setFailed([]);
    setPayOpen(false);
    if (id) void fetchOrder();
  }

  /** Amal: band holat, xabar, `data.order` → hisob; ziddiyatda qayta o'qish; javob kelmasa — holat tiklanadi */
  const run: Runner = useCallback(async <T,>(tag: string, fn: () => Promise<ActionResult<T>>) => {
    if (busyRef.current) return null;
    busyRef.current = true;
    setBusy(tag);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const call = fn();
      const r = await Promise.race([
        call,
        new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), ACTION_TIMEOUT_MS); }),
      ]);
      if (r === 'timeout') {
        toast(ok.actionTimeout, 'error');
        void fetchOrder();
        call.then((late) => {
          const data = late?.ok ? (late.data as unknown as { order?: OrderView }) : null;
          if (data && typeof data === 'object' && data.order) setOrder(data.order);
        }).catch(() => { /* kech kelgan xato — holat allaqachon qayta o'qilgan */ });
        return null;
      }
      if (r.ok) {
        const data = r.data as unknown as { order?: OrderView };
        if (data && typeof data === 'object' && data.order) setOrder(data.order);
        if (r.success) toast(r.success, 'success');
      } else {
        toast(r.error, 'error');
        if (REFETCH_CODES.has(r.code)) void fetchOrder();
      }
      return r;
    } catch {
      toast(d.restaurant.errors.failed, 'error');
      void fetchOrder();
      return null;
    } finally {
      if (timer) clearTimeout(timer);
      busyRef.current = false;
      setBusy(null);
    }
  }, [setOrder, fetchOrder, d.restaurant.errors.failed, ok.actionTimeout]);

  const bills = useMemo(() => buildBills(board), [board]);
  const rows = useMemo(() => bills.rows.filter((r) => billMatches(r, q)), [bills, q]);
  const selRow = useMemo(
    () => bills.rows.find((r) => r.order.id === selId || r.linked.some((x) => x.id === selId)) ?? null,
    [bills, selId],
  );
  const view = order && order.id === selId ? order : null;

  async function precheck() {
    if (!view) return;
    if (view.status === 'precheck') { setPrintKey(Date.now()); return; }
    const r = await run('precheck', () => precheckOrderAction(view.id));
    if (r?.ok) setPrintKey(Date.now());
    else if (r && r.code === 'sendFailed' && Array.isArray(r.details?.failed)) setFailed(r.details.failed as SendFailure[]);
  }

  async function ackBill(tableId: string) {
    if (ackingTable) return;
    setAckingTable(tableId);
    try {
      const r = await ackTableCallAction({ tableId, kind: 'bill' });
      if (r.ok) {
        setBoard((b) => ({ ...b, tables: b.tables.map((t) => (t.id === tableId ? { ...t, calls: { ...t.calls, billAt: null } } : t)) }));
        toast(r.success ?? ok.callAcked, 'success');
      } else {
        toast(r.error, 'error');
      }
    } catch {
      toast(d.restaurant.errors.failed, 'error');
    } finally {
      setAckingTable(null);
    }
  }

  /** To'lov oynasi yopildi: hisob yopilgan bo'lsa — navbatga qaytamiz va navbat darhol yangilanadi */
  function closePay() {
    setPayOpen(false);
    if (view && view.status === 'paid') { select(null); void refreshBoard(); }
  }

  // Klaviatura: / — qidiruv (to'lov oynasi yopiq bo'lsa)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (payOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/' && !isTyping(e.target)) { e.preventDefault(); searchRef.current?.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [payOpen]);

  function changeBranch(id: string) {
    router.replace(`/app/tables/cashier?branch=${encodeURIComponent(id)}`);
  }

  const tablesHref = `/app/tables?branch=${encodeURIComponent(board.branchId)}`;

  return (
    <div className="rt-cashier">
      <header className="t-page-head rt-head">
        <div>
          <h1 className="t-page-title">{k.title}</h1>
          <p className="t-page-sub">
            {tr(k.summaryLine, { n: bills.summary.count, sum: fmtMoney(bills.summary.due) })}
            <span className={`rt-live${online ? '' : ' is-off'}`} role="status">
              <i aria-hidden="true" />{online ? d.restaurant.tables.live : d.restaurant.tables.offline}
            </span>
          </p>
        </div>
        <div className="t-page-actions rt-head-actions">
          {board.branches.length > 1 && (
            <select className="input rt-branch" value={board.branchId} onChange={(e) => changeBranch(e.target.value)} aria-label={d.restaurant.tables.branch}>
              {board.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <Link href={tablesHref} className="btn btn-ghost btn-with-icon"><Icon name="grid" size={18} />{k.tablesLink}</Link>
        </div>
      </header>

      {noShift && (canShift ? (
        <Link href="/app/shifts" className="rt-cash-warn">
          <Icon name="alert" size={18} /><span>{k.noShift}</span><b>{k.openShift}</b>
        </Link>
      ) : (
        <p className="rt-cash-warn"><Icon name="alert" size={18} /><span>{k.noShift}</span></p>
      ))}

      <div className="rt-cash" data-pane={selId ? 'detail' : 'queue'}>
        <section className="rt-cash-queue" aria-labelledby="rt-cash-q">
          <div className="rt-cash-qhead">
            <h2 id="rt-cash-q" className="rt-cash-h">
              {k.queue} <span className="rt-count">{bills.summary.count}</span>
            </h2>
            <label className="rt-search">
              <Icon name="search" size={18} />
              <input
                ref={searchRef}
                type="search"
                inputMode="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={k.searchPh}
                aria-label={k.searchAria}
                autoComplete="off"
              />
            </label>
            <BillsSummaryBar summary={bills.summary} compact />
          </div>
          <div className="rt-cash-qlist">
            {rows.length === 0 ? (
              <div className="rt-none">
                <b>{q.trim() ? k.noMatch : k.noBills}</b>
                {!q.trim() && <p className="rt-muted rt-small">{k.noBillsHint}</p>}
              </div>
            ) : (
              <>
                <p className="rt-muted rt-small rt-cash-qhint">{k.queueHint}</p>
                <BillsList
                  rows={rows}
                  now={now}
                  label={k.queue}
                  selectedId={selId}
                  onSelect={select}
                  canAck={canAck}
                  ackingTable={ackingTable}
                  onAck={ackBill}
                />
              </>
            )}
          </div>
        </section>

        <section className="rt-cash-detail" aria-label={view ? billTitle(view, d) : k.pickBill}>
          {!selId ? (
            <div className="ux-empty rt-empty">
              <span className="ux-empty-ic" aria-hidden="true"><Icon name="wallet" size={26} /></span>
              <b>{k.pickBill}</b>
              <p className="rt-muted">{k.pickBillHint}</p>
            </div>
          ) : !view ? (
            <div className="ux-empty rt-empty">
              {lost ? (
                <>
                  <b>{k.goneHint}</b>
                  <button type="button" className="btn btn-primary" onClick={() => select(null)}>{k.backToQueue}</button>
                </>
              ) : <p className="rt-muted" role="status">{d.common.loading}</p>}
            </div>
          ) : (
            <BillDetail
              view={view}
              now={now}
              busy={busy}
              failed={failed}
              inQueue={!!selRow}
              billAt={selRow && selRow.order.id === view.id ? selRow.billAt : null}
              linked={selRow && selRow.order.id === view.id ? selRow.linked : []}
              parent={selRow && selRow.order.id !== view.id ? selRow.order : null}
              canAck={canAck}
              acking={!!ackingTable}
              onAck={() => { if (selRow?.tableId) void ackBill(selRow.tableId); }}
              onSelect={select}
              onBack={() => select(null)}
              onPrecheck={precheck}
              onPay={() => setPayOpen(true)}
              onDismissFailed={() => setFailed([])}
            />
          )}
        </section>
      </div>

      {printKey > 0 && view && (
        <iframe key={printKey} src={`/app/tables/${view.id}/precheck?print=1`} title={k.precheck} className="rt-print-frame" aria-hidden="true" tabIndex={-1} />
      )}

      {payOpen && view && (
        <PayDialog
          order={view}
          busy={busy === 'pay'}
          run={run}
          onClose={closePay}
          onFailed={setFailed}
          shopName={shopName}
          backHref="/app/tables/cashier"
          onBack={closePay}
          backLabel={k.backToQueue}
        />
      )}
    </div>
  );
}

/** Tanlangan hisob: sarlavha, taomlar, summalar, «Pre-chek» va «To'lash» */
function BillDetail({ view, now, busy, failed, inQueue, billAt, linked, parent, canAck, acking, onAck, onSelect, onBack, onPrecheck, onPay, onDismissFailed }: {
  view: OrderView;
  now: number;
  busy: string | null;
  failed: SendFailure[];
  /** Hisob hali to'lov navbatidami (to'langan/bekor — yo'q) */
  inQueue: boolean;
  billAt: string | null;
  /** Stol hisobi: shu stolga bog'langan saboylar */
  linked: readonly { id: string; orderNo: string; tableNumber: number | null; forTableNumber: number | null; due: number | null; status: OrderView['status'] }[];
  /** Saboy: bog'langan stol hisobi (navbatda bo'lsa) */
  parent: { id: string; tableNumber: number | null } | null;
  canAck: boolean;
  acking: boolean;
  onAck: () => void;
  onSelect: (id: string) => void;
  onBack: () => void;
  onPrecheck: () => void;
  onPay: () => void;
  onDismissFailed: () => void;
}) {
  const d = useDict();
  const k = d.cashier;
  const ok = d.restaurant.order;
  const c = d.restaurant.common;
  const b = view.bill;
  const can = view.can;
  const closed = view.status === 'paid' || view.status === 'cancelled';
  const mins = minutesSince(view.openedAt, now);
  const unpaid = view.items.filter((i) => i.status !== 'voided' && i.status !== 'pending' && !i.paid);
  const paid = view.items.filter((i) => i.status !== 'voided' && i.paid);

  return (
    <div className="rt-cash-card">
      <header className="rt-cash-dhead">
        <button type="button" className="rt-back rt-cash-back" onClick={onBack} aria-label={k.backToQueue}><Icon name="arrowLeft" size={20} /></button>
        <div className="rt-oh-title">
          <h2>{billTitle(view, d)}</h2>
          <p>
            <span>{view.orderNo}</span>
            <span>{c.orderTypes[view.type]}</span>
            {view.hallName && <span>{view.hallName}</span>}
          </p>
        </div>
        <span className="rt-status" data-status={view.status}>{c.orderStatuses[view.status]}</span>
        <div className="rt-oh-meta">
          <span><Icon name="user" size={14} />{view.waiterName ?? k.noWaiter}</span>
          {mins !== null && <span suppressHydrationWarning><Icon name="clock" size={14} />{hhmm(view.openedAt)} · {tr(c.minutes, { n: mins })}</span>}
          {view.guests ? <span><Icon name="users" size={14} />{view.guests}</span> : null}
        </div>
      </header>

      {billAt && (
        <div className="rt-bill-call rt-cash-call">
          <Icon name="bell" size={16} />
          <span suppressHydrationWarning>{k.billRequested} · {hhmm(billAt)}</span>
          {canAck && <button type="button" onClick={onAck} disabled={acking}>{k.ack}</button>}
        </div>
      )}

      <div className="rt-cash-body">
        {closed && <p className="rt-hint rt-hint--lock"><Icon name="check" size={16} /><span>{k.closedTitle}</span></p>}
        {!closed && !inQueue && <p className="rt-hint">{k.goneHint}</p>}
        {b.counts.pending > 0 && <p className="rt-hint rt-hint--warn">{k.pendingQr}</p>}
        {b.counts.unsent > 0 && !closed && <p className="rt-hint">{k.unsentHint}</p>}
        {failed.length > 0 && (
          <div className="rt-failed" role="alert">
            <div className="rt-block-head">
              <h3><Icon name="alert" size={16} />{ok.failedTitle}</h3>
              <button type="button" className="u-icon-btn" onClick={onDismissFailed} aria-label={d.common.close}><Icon name="close" size={15} /></button>
            </div>
            <ul>{failed.map((f) => <li key={f.itemId}>{f.message}</li>)}</ul>
          </div>
        )}

        <h3 className="rt-cash-h3">{k.items} <span className="rt-count">{unpaid.length}</span></h3>
        {unpaid.length === 0 ? (
          <p className="rt-muted rt-small">{k.noItems}</p>
        ) : (
          <ul className="rt-cash-items">
            {unpaid.map((i) => (
              <li key={i.id}>
                <span className="rt-item-qty">{fmtQty(i.qty)}×</span>
                <span className="rt-item-name">
                  <b>{i.displayName}</b>
                  <small>{fmtMoney(i.price)}{i.note ? ` · «${i.note}»` : ''}</small>
                </span>
                <span className="rt-item-sum">{fmtMoney(i.total)}</span>
              </li>
            ))}
          </ul>
        )}

        {paid.length > 0 && (
          <details className="rt-cash-paid">
            <summary>{k.paidItems} <span className="rt-count">{paid.length}</span></summary>
            <ul className="rt-cash-items">
              {paid.map((i) => (
                <li key={i.id}>
                  <span className="rt-item-qty">{fmtQty(i.qty)}×</span>
                  <span className="rt-item-name"><b>{i.displayName}</b></span>
                  <span className="rt-item-sum">{fmtMoney(i.total)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {linked.length > 0 && (
          <section className="rt-cash-linked" aria-labelledby="rt-cash-linked-t">
            <h3 id="rt-cash-linked-t" className="rt-cash-h3"><Icon name="basket" size={16} />{k.linkedTitle}</h3>
            <p className="rt-muted rt-small">{k.linkedHint}</p>
            <ul>
              {linked.map((x) => (
                <li key={x.id}>
                  <button type="button" className="btn btn-tinted rt-cash-linkbtn" onClick={() => onSelect(x.id)}>
                    <span>{billTitle(x, d)}</span>
                    <b>{fmtMoney(x.due ?? 0)} {d.common.sum}</b>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {parent && parent.tableNumber !== null && (
          <button type="button" className="btn btn-plain rt-cash-parent" onClick={() => onSelect(parent.id)}>
            <Icon name="grid" size={16} />{tr(k.tableBillOf, { n: parent.tableNumber })}
          </button>
        )}
      </div>

      <div className="rt-cash-foot">
        <dl className="rt-sum">
          {(b.counts.items > 0 || b.paid > 0) && (
            <div><dt>{b.paid > 0 ? ok.subtotalDue : ok.subtotal}</dt><dd>{fmtMoney(b.dueSubtotal)}</dd></div>
          )}
          {b.servicePct > 0 && b.dueSubtotal > 0 && <div><dt>{tr(c.serviceChargeLine, { pct: b.servicePct })}</dt><dd>{fmtMoney(b.dueServiceCharge)}</dd></div>}
          {b.duePackFee > 0 && <div><dt>{c.packFeeLine}</dt><dd>{fmtMoney(b.duePackFee)}</dd></div>}
          {b.paid > 0 && <div className="is-muted"><dt>{ok.paid}</dt><dd>{fmtMoney(b.paid)}</dd></div>}
          <div className="rt-sum-total"><dt>{closed ? ok.total : ok.due}</dt><dd>{fmtMoney(closed ? b.total : b.due)} <small>{d.common.sum}</small></dd></div>
        </dl>
        {!closed && can?.discount && <p className="rt-muted rt-small">{k.discountHint}</p>}
        {!closed ? (
          <div className="rt-foot-acts">
            {(can?.precheck || view.status === 'precheck') && (
              <button type="button" className="btn btn-ghost btn-with-icon" onClick={onPrecheck} disabled={!!busy || (view.status === 'open' && b.counts.items === 0)}>
                <Icon name="clipboard" size={17} />
                {busy === 'precheck' ? d.common.loading : view.status === 'precheck' ? k.precheckPrint : k.precheck}
              </button>
            )}
            {can?.pay && (
              <button type="button" className="btn btn-primary rt-pay-btn rt-cash-pay" onClick={onPay} disabled={!!busy || b.due <= 0 || b.counts.pending > 0}>
                <span>{k.pay}</span>
                <b>{fmtMoney(b.due)}</b>
              </button>
            )}
          </div>
        ) : (
          <button type="button" className="btn btn-primary btn-full" onClick={onBack}>{k.backToQueue}</button>
        )}
        <Link href={`/app/tables/${view.id}`} className="btn btn-plain btn-sm rt-cash-open">{k.openOrder}</Link>
      </div>
    </div>
  );
}
