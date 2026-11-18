'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from '@/components/icons/Icon';
import MoreMenu from '@/components/ui/MoreMenu';
import { fmtMoney } from '@/lib/format';
import { toast } from '@/lib/toast';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { addQty, fmtQty, isFractionalUnit, parseQty, priceTimesQty } from '@/lib/qty';
import { RESTAURANT_LIMITS } from '@/lib/restaurant/types';
import type { MenuItemView } from '@/lib/restaurant/queries';
import type { OrderSummary, OrderView } from '@/lib/restaurant/view';
import type { SendFailure } from '@/lib/restaurant/ops';
import type { ActionResult } from '@/lib/restaurant/session';
import {
  addOrderItemsAction,
  bumpItemsAction,
  confirmQrItemsAction,
  precheckOrderAction,
  reopenOrderAction,
  sendToKitchenAction,
} from '@/app/actions/restaurant';
import MenuPanel, { dishOff, type MenuData } from './MenuPanel';
import ModifierDialog, { type PickedDish } from './ModifierDialog';
import OrderItems, { type ItemAction } from './OrderItems';
import { CancelDialog, ConfirmDialog, InfoDialog, TransferDialog, VoidDialog, type Runner } from './OrderDialogs';
import PayDialog from './PayDialog';
import { QtyStepper } from './Modal';
import { getJson, hhmm, minutesSince, newClientId, useNow, usePolling } from './shared';

/** Savatdagi (hali serverga yuborilmagan) taom. `key` — clientItemId (takroriy yuborish xavfsiz) */
interface CartLine {
  key: string;
  productId: string;
  name: string;
  unit: string | null;
  /** Ko'rsatish uchun: asosiy narx + modifikatorlar (server qayta hisoblaydi) */
  price: number;
  qty: number;
  qtyText?: string;
  optionIds: string[];
  mods: string[];
  note: string;
}

type Dialog =
  | { kind: 'mod'; item: MenuItemView }
  | { kind: 'void'; itemId: string }
  | { kind: 'info' }
  | { kind: 'transfer' }
  | { kind: 'cancel' }
  | { kind: 'reopen' }
  | { kind: 'pay' }
  | null;

const POLL_MS = 3000;
const MENU_POLL_MS = 30_000;
/** Shuncha vaqt `since` bo'yicha o'zgarish ko'rinmasa ham buyurtma to'liq qayta o'qiladi */
const FULL_REFRESH_MS = 30_000;
/** Server action shuncha vaqtda javob bermasa — tugma «Yuklanmoqda»da qotib qolmaydi (run → holat tiklanadi) */
const ACTION_TIMEOUT_MS = 25_000;
const CART_KEY = 'savora_order_cart';

/** Ziddiyat yoki holat o'zgargan bo'lishi mumkin — buyurtma darhol qayta o'qiladi */
const REFETCH_CODES = new Set(['conflict', 'orderClosed', 'orderLocked', 'notPrecheck', 'badTransition', 'itemNotFound', 'itemPaid', 'pendingItems', 'hasActiveItems', 'hasPayments', 'stopListed', 'outOfStock', 'sendFailed', 'tableBusy']);

function readCart(orderId: string): CartLine[] {
  try {
    const raw = localStorage.getItem(`${CART_KEY}:${orderId}`);
    const list = raw ? (JSON.parse(raw) as CartLine[]) : [];
    return Array.isArray(list) ? list.filter((l) => l && typeof l.key === 'string' && typeof l.productId === 'string') : [];
  } catch {
    return [];
  }
}
function writeCart(orderId: string, lines: CartLine[]) {
  try {
    if (lines.length) localStorage.setItem(`${CART_KEY}:${orderId}`, JSON.stringify(lines));
    else localStorage.removeItem(`${CART_KEY}:${orderId}`);
  } catch { /* xotira yo'q — savat shu sahifada qoladi */ }
}

/**
 * Buyurtma ekrani (/app/tables/[orderId]) — ofitsant va kassir: menyu → savat → «Oshxonaga yuborish»,
 * taomlar holati va vaqtlari, «Yetkazildi», QR taomlarini tasdiqlash, bekor qilish, o'tkazish, pre-chek, to'lov.
 * Holat faqat server javobidan (`data.order`, polling) — `rev` kattasi qabul qilinadi; optimistik o'zgarish yo'q.
 * Polling: 3 s `orders?since=` (yengil), o'zgargan bo'lsa `orders/:id`.
 */
export default function OrderScreen({ initialOrder, initialMenu, serverNow, shopName }: {
  initialOrder: OrderView;
  initialMenu: MenuData | null;
  serverNow: number;
  shopName: string;
}) {
  const d = useDict();
  const k = d.restaurant.order;
  const c = d.restaurant.common;
  const router = useRouter();

  const [order, setOrderRaw] = useState<OrderView>(initialOrder);
  const [menu, setMenu] = useState<MenuData | null>(initialMenu);
  const [cart, setCartRaw] = useState<CartLine[]>([]);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [failed, setFailed] = useState<SendFailure[]>([]);
  const [tab, setTab] = useState<'menu' | 'order'>('order');
  const [lost, setLost] = useState('');
  const [online, setOnline] = useState(true);
  const [skew, setSkew] = useState(0);
  const [printKey, setPrintKey] = useState(0);
  const now = useNow(serverNow, skew);

  const orderRef = useRef(order);
  const busyRef = useRef(false);
  const sinceRef = useRef(new Date(serverNow - 5_000).toISOString());
  const fullAt = useRef(Date.now());

  /** Server javobi asosiy: faqat yangiroq (`rev` katta yoki teng) ko'rinish qabul qilinadi */
  const setOrder = useCallback((next: OrderView) => {
    setOrderRaw((cur) => {
      const pick = next.id !== cur.id || next.rev >= cur.rev ? next : cur;
      orderRef.current = pick;
      return pick;
    });
  }, []);

  const setCart = useCallback((fn: (l: CartLine[]) => CartLine[]) => {
    setCartRaw((cur) => {
      const next = fn(cur);
      writeCart(orderRef.current.id, next);
      return next;
    });
  }, []);

  // Saqlangan savat (sahifa yangilansa yo'qolmasin)
  useEffect(() => {
    const saved = readCart(initialOrder.id);
    if (saved.length) {
      setCartRaw(saved);
      setTab('menu');
    } else if (initialOrder.can?.edit && !initialOrder.items.length) {
      setTab('menu');
    }
  }, [initialOrder.id, initialOrder.can?.edit, initialOrder.items.length]);

  const fetchOrder = useCallback(async (signal?: AbortSignal) => {
    const r = await getJson<{ order: OrderView }>(`/api/restaurant/orders/${orderRef.current.id}`, signal);
    fullAt.current = Date.now();
    if (r.ok) { setOnline(true); setOrder(r.data.order); return; }
    if (r.status === 401) { router.refresh(); return; }
    if (r.status === 404) { setLost(r.error || d.restaurant.errors.orderNotFound); return; }
    setOnline(false);
  }, [setOrder, router, d.restaurant.errors.orderNotFound]);

  const poll = useCallback(async (signal: AbortSignal) => {
    const cur = orderRef.current;
    const r = await getJson<{ serverTime: string; next: string; orders: OrderSummary[] }>(
      `/api/restaurant/orders?since=${encodeURIComponent(sinceRef.current)}&branchId=${encodeURIComponent(cur.branchId)}`,
      signal,
    );
    if (!r.ok) {
      if (r.status === 401) router.refresh();
      else setOnline(false);
      return;
    }
    setOnline(true);
    sinceRef.current = r.data.next;
    const st = Date.parse(r.data.serverTime);
    if (Number.isFinite(st)) setSkew(st - Date.now());
    const hit = r.data.orders.find((o) => o.id === cur.id);
    if ((hit && hit.updatedAt !== cur.updatedAt) || Date.now() - fullAt.current > FULL_REFRESH_MS) await fetchOrder(signal);
  }, [fetchOrder, router]);

  const closed = order.status === 'paid' || order.status === 'cancelled';
  usePolling(poll, POLL_MS, !lost && order.status !== 'cancelled');

  // Yopilgan buyurtmaning yuborilmagan savati qurilmada qolib ketmasin
  useEffect(() => {
    if (closed) setCart(() => []);
  }, [closed, setCart]);

  const editable = !!order.can?.edit;
  const refreshMenu = useCallback(async (signal?: AbortSignal) => {
    const r = await getJson<MenuData>(`/api/restaurant/menu?branchId=${encodeURIComponent(orderRef.current.branchId)}`, signal);
    if (r.ok) setMenu(r.data);
  }, []);
  usePolling(refreshMenu, MENU_POLL_MS, editable);
  // Hisob qayta ochilganda (yoki menyu serverda yuklanmagan bo'lsa) — menyu darhol
  useEffect(() => {
    if (editable && !menu) void refreshMenu();
  }, [editable, menu, refreshMenu]);

  /**
   * Amal: band holat, xabar, `data.order` → holat; ziddiyat/holat xatosida buyurtma qayta o'qiladi.
   * Server action javob bermasa (dev'da qayta kompilyatsiya, tarmoq uzilishi) — ACTION_TIMEOUT_MS dan keyin
   * band holat tiklanadi va buyurtma qayta o'qiladi; kech kelgan javobdagi buyurtma (rev bo'yicha) qabul qilinadi.
   * Takroriy bosish xavfsiz: to'lov `payId`, taom `clientItemId` bilan idempotent.
   */
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
        toast(k.actionTimeout, 'error');
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
  }, [setOrder, fetchOrder, d.restaurant.errors.failed, k.actionTimeout]);

  const menuById = useMemo(() => new Map((menu?.items ?? []).map((i) => [i.id, i])), [menu]);
  const cartQty = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of cart) m.set(l.productId, addQty(m.get(l.productId) ?? 0, l.qty));
    return m;
  }, [cart]);
  const cartTotal = cart.reduce((s, l) => s + priceTimesQty(l.price, l.qty), 0);
  const cartBad = cart.some((l) => l.qtyText !== undefined && parseQty(l.qtyText, l.unit) === null);

  /* ───────── savat ───────── */

  function addLine(item: MenuItemView, pick?: PickedDish) {
    if (cart.length >= RESTAURANT_LIMITS.maxAddItems && !cart.some((l) => l.productId === item.id && !l.optionIds.length && !l.note)) {
      toast(d.restaurant.errors.tooManyItems, 'error');
      return;
    }
    setCart((cur) => {
      if (!pick) {
        // Oddiy taom: bir xil qator bo'lsa — miqdor +1
        const i = cur.findIndex((l) => l.productId === item.id && !l.optionIds.length && !l.note);
        if (i >= 0) {
          const next = [...cur];
          next[i] = { ...next[i], qty: addQty(next[i].qty, 1), qtyText: undefined };
          return next;
        }
      }
      return [...cur, {
        key: newClientId('it'),
        productId: item.id,
        name: item.name,
        unit: item.unit,
        price: item.price + (pick?.extra ?? 0),
        qty: pick?.qty ?? 1,
        optionIds: pick?.optionIds ?? [],
        mods: pick?.mods ?? [],
        note: pick?.note ?? '',
      }];
    });
  }

  function onPick(item: MenuItemView) {
    if (!editable || dishOff(item)) return;
    if (item.modifierGroups.length) setDialog({ kind: 'mod', item });
    else addLine(item);
  }

  const changeQty = (key: string, qty: number) => setCart((cur) => cur.flatMap((l) => (l.key !== key ? [l] : qty <= 0 ? [] : [{ ...l, qty, qtyText: undefined }])));
  const typeQty = (key: string, text: string) => setCart((cur) => cur.map((l) => {
    if (l.key !== key) return l;
    const n = parseQty(text, l.unit);
    return n === null ? { ...l, qtyText: text } : { ...l, qty: n, qtyText: text };
  }));
  const setNote = (key: string, note: string) => setCart((cur) => cur.map((l) => (l.key === key ? { ...l, note } : l)));
  const removeLine = (key: string) => setCart((cur) => cur.filter((l) => l.key !== key));

  /** Savatni buyurtmaga qo'shish (`send` — darhol oshxonaga). clientItemId bilan — takror yuborilsa ikki marta qo'shilmaydi */
  async function submitCart(send: boolean) {
    if (!cart.length || cartBad || busy) return;
    const lines = cart;
    const items = lines.map((l) => ({
      clientItemId: l.key,
      productId: l.productId,
      qty: l.qty,
      ...(l.optionIds.length ? { optionIds: l.optionIds } : {}),
      ...(l.note.trim() ? { note: l.note.trim().slice(0, RESTAURANT_LIMITS.noteMax) } : {}),
    }));
    const added = await run('add', () => addOrderItemsAction(order.id, { items }));
    if (!added?.ok) {
      if (added && (added.code === 'stopListed' || added.code === 'productNotFound')) void refreshMenu();
      return;
    }
    // Qo'shildi (yoki avval qo'shilgan — duplicates): savat tozalanadi
    const keys = new Set(lines.map((l) => l.key));
    setCart((cur) => cur.filter((l) => !keys.has(l.key)));
    setNoteFor(null);
    if (!send) return;
    const ids = added.data.order.items.filter((i) => i.status === 'new' && i.clientItemId && keys.has(i.clientItemId)).map((i) => i.id);
    if (ids.length) await sendItems(ids);
    setTab('order');
  }

  async function sendItems(itemIds?: string[]) {
    const r = await run('send', () => sendToKitchenAction(order.id, itemIds?.length ? { itemIds } : {}));
    if (!r) return;
    if (r.ok) {
      setFailed(r.data.failed);
      if (r.data.failed.length) toast(tr(k.sendPartial, { n: r.data.failed.length }), 'warn');
    } else if (r.code === 'sendFailed' && Array.isArray(r.details?.failed)) {
      setFailed(r.details.failed as SendFailure[]);
    }
  }

  async function onItemAction(a: ItemAction) {
    if (a.kind === 'void') { setDialog({ kind: 'void', itemId: a.item.id }); return; }
    if (a.kind === 'serve') { await run('serve', () => bumpItemsAction(order.id, { itemIds: a.ids, to: 'served' })); return; }
    if (a.kind === 'send') { await sendItems(a.ids); return; }
    const r = await run('confirm', () => confirmQrItemsAction(order.id, { itemIds: a.ids, reject: a.reject, send: a.send }));
    if (r?.ok && r.data.failed?.length) setFailed(r.data.failed);
  }

  async function precheck() {
    if (order.status === 'precheck') { setPrintKey(Date.now()); return; }
    const r = await run('precheck', () => precheckOrderAction(order.id));
    if (r?.ok) setPrintKey(Date.now());
    else if (r && r.code === 'sendFailed' && Array.isArray(r.details?.failed)) setFailed(r.details.failed as SendFailure[]);
  }

  async function reopen() {
    const r = await run('reopen', () => reopenOrderAction(order.id));
    if (r?.ok) setDialog(null);
  }

  // Klaviatura: / — menyu qidiruvi, P — to'lov (oyna yopiq bo'lsa)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (dialog || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.key === '/') {
        const el = document.querySelector<HTMLInputElement>('.rt-menu .rt-search input');
        if (el) { e.preventDefault(); setTab('menu'); el.focus(); }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dialog]);

  const backHref = `/app/tables?branch=${encodeURIComponent(order.branchId)}`;
  const title = order.tableNumber !== null ? tr(c.tableN, { n: order.tableNumber }) : tr(k.takeawayTitle, { no: order.orderNo.split('-').pop() ?? order.orderNo });
  const mins = minutesSince(order.openedAt, now);
  const b = order.bill;
  const can = order.can;
  const voidItem = dialog?.kind === 'void' ? order.items.find((i) => i.id === dialog.itemId) : undefined;
  const showMenu = editable && !!menu;
  const requireVoidReason = order.requireVoidReason;

  if (lost) {
    return (
      <div className="ux-empty rt-empty">
        <span className="ux-empty-ic" aria-hidden="true"><Icon name="alert" size={26} /></span>
        <b>{lost}</b>
        <Link href={backHref} className="btn btn-primary">{k.backToTables}</Link>
      </div>
    );
  }

  return (
    <div className={`rt-order${showMenu ? '' : ' rt-order--solo'}`} data-tab={tab}>
      <header className="rt-oh">
        <Link href={backHref} className="rt-back" aria-label={k.backToTables}><Icon name="arrowLeft" size={20} /></Link>
        <div className="rt-oh-title">
          <h1>{title}</h1>
          <p>
            <span>{order.orderNo}</span>
            <span>{c.orderTypes[order.type]}</span>
            {order.source === 'qr' && <span>{c.orderSources.qr}</span>}
          </p>
        </div>
        <span className="rt-status" data-status={order.status}>{c.orderStatuses[order.status]}</span>
        <span className={`rt-live${online ? '' : ' is-off'}`} role="status" title={online ? d.restaurant.tables.live : d.restaurant.tables.offline}>
          <i aria-hidden="true" /><span className="rt-live-t">{online ? d.restaurant.tables.live : d.restaurant.tables.offline}</span>
        </span>
        <div className="rt-oh-meta">
          <span><Icon name="user" size={14} />{order.waiterName ?? d.restaurant.tables.noWaiter}</span>
          {mins !== null && <span title={hhmm(order.openedAt)} suppressHydrationWarning><Icon name="clock" size={14} />{tr(c.minutes, { n: mins })}</span>}
          {can?.edit ? (
            <button type="button" className="rt-oh-guests" onClick={() => setDialog({ kind: 'info' })} aria-label={k.infoTitle}>
              <Icon name="users" size={14} />{order.guests ?? '—'}<Icon name="edit" size={12} />
            </button>
          ) : order.guests ? <span><Icon name="users" size={14} />{order.guests}</span> : null}
        </div>
        {(can?.edit || can?.transfer || can?.cancel || can?.reopen || order.status === 'precheck') && (
          <MoreMenu label={k.more}>
            {can?.edit && <button type="button" role="menuitem" onClick={() => setDialog({ kind: 'info' })}>{k.infoTitle}</button>}
            {can?.transfer && <button type="button" role="menuitem" onClick={() => setDialog({ kind: 'transfer' })}>{k.transfer}</button>}
            {order.status === 'precheck' && (
              <a role="menuitem" href={`/app/tables/${order.id}/precheck`} target="_blank" rel="noopener">{k.precheckOpen}</a>
            )}
            {can?.reopen && <button type="button" role="menuitem" onClick={() => setDialog({ kind: 'reopen' })}>{k.reopen}</button>}
            {can?.cancel && <button type="button" role="menuitem" className="ux-danger" onClick={() => setDialog({ kind: 'cancel' })}>{k.cancelOrder}</button>}
          </MoreMenu>
        )}
        {order.note && <p className="rt-oh-note"><Icon name="edit" size={13} />{order.note}</p>}
      </header>

      {showMenu && (
        <div className="rt-tabs" role="tablist" aria-label={k.menu}>
          <button type="button" role="tab" aria-selected={tab === 'menu'} onClick={() => setTab('menu')}>
            {k.menu}{cart.length > 0 && <b>{cart.length}</b>}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'order'} onClick={() => setTab('order')}>
            {k.orderTab}{b.counts.items + b.counts.pending > 0 && <b>{b.counts.items + b.counts.pending}</b>}
          </button>
        </div>
      )}

      {showMenu && (
        <div className="rt-col rt-col--menu">
          <MenuPanel menu={menu!} onPick={onPick} cartQty={cartQty} />
        </div>
      )}

      <aside className="rt-col rt-col--panel rt-panel" aria-label={k.orderTab}>
        <div className="rt-panel-body">
          {order.status === 'precheck' && (
            <div className="rt-hint rt-hint--lock">
              <Icon name="lock" size={16} />
              <span>{k.lockedHint}</span>
              {can?.reopen && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDialog({ kind: 'reopen' })}>{k.reopen}</button>}
            </div>
          )}
          {order.status === 'cancelled' && (
            <p className="rt-hint rt-hint--warn">{k.cancelledInfo}{order.cancelReason ? ` · ${order.cancelReason}` : ''}</p>
          )}

          {cart.length > 0 && (
            <section className="rt-cart" aria-labelledby="rt-cart-t">
              <div className="rt-block-head">
                <h2 id="rt-cart-t">{k.cart} <span className="rt-count">{cart.length}</span></h2>
                <button type="button" className="btn btn-plain btn-sm" onClick={() => setCart(() => [])} disabled={!!busy}>{k.cartClear}</button>
              </div>
              <ul>
                {cart.map((l) => {
                  const off = menuById.get(l.productId);
                  const stop = off ? dishOff(off) : null;
                  const frac = isFractionalUnit(l.unit);
                  // Savatdagi jami miqdor ombordagidan ko'p — yuborishda «yetarli emas» bo'ladi, oldindan ogohlantirish
                  const short = !stop && off?.available != null && (cartQty.get(l.productId) ?? 0) > off.available;
                  return (
                    <li key={l.key} className="rt-cart-line" data-bad={stop ? true : undefined}>
                      <div className="rt-cart-name">
                        <b>{l.name}</b>
                        {l.mods.length > 0 && <small>{l.mods.join(', ')}</small>}
                        {l.note && noteFor !== l.key && <small className="rt-note">«{l.note}»</small>}
                        {stop && <small className="rt-bad">{stop === 'stop' ? k.stopListed : k.outOfStock}</small>}
                        {short && <small className="rt-bad">{tr(k.leftN, { n: fmtQty(off!.available!) })}</small>}
                      </div>
                      <QtyStepper
                        value={l.qty}
                        onChange={(n) => changeQty(l.key, n)}
                        min={0}
                        max={RESTAURANT_LIMITS.maxItemQty}
                        label={`${k.qty}: ${l.name}`}
                        decLabel={k.qtyDec}
                        incLabel={k.qtyInc}
                        fractional={frac}
                        text={l.qtyText ?? fmtQty(l.qty)}
                        onText={(s) => typeQty(l.key, s)}
                      />
                      <span className="rt-cart-sum">{fmtMoney(priceTimesQty(l.price, l.qty))}</span>
                      <span className="rt-cart-btns">
                        <button type="button" className="u-icon-btn" onClick={() => setNoteFor(noteFor === l.key ? null : l.key)} aria-label={`${k.note}: ${l.name}`} aria-expanded={noteFor === l.key}>
                          <Icon name="edit" size={15} />
                        </button>
                        <button type="button" className="u-icon-btn u-icon-btn--danger" onClick={() => removeLine(l.key)} aria-label={`${k.remove}: ${l.name}`}>
                          <Icon name="trash" size={15} />
                        </button>
                      </span>
                      {noteFor === l.key && (
                        <input
                          className="input rt-cart-note"
                          value={l.note}
                          onChange={(e) => setNote(l.key, e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); setNoteFor(null); } }}
                          maxLength={RESTAURANT_LIMITS.noteMax}
                          placeholder={k.notePh}
                          aria-label={`${k.note}: ${l.name}`}
                          autoFocus
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="rt-cart-acts">
                <button type="button" className="btn btn-ghost" onClick={() => submitCart(false)} disabled={!!busy || cartBad || !can?.edit}>
                  {k.saveDraft}
                </button>
                <button type="button" className="btn btn-primary rt-send-btn" onClick={() => submitCart(true)} disabled={!!busy || cartBad || !can?.edit}>
                  <Icon name="send" size={17} />
                  <span>{busy === 'add' || busy === 'send' ? d.common.sending : k.send}</span>
                  <b>{fmtMoney(cartTotal)}</b>
                </button>
              </div>
            </section>
          )}

          {failed.length > 0 && (
            <div className="rt-failed" role="alert">
              <div className="rt-block-head">
                <h3><Icon name="alert" size={16} />{k.failedTitle}</h3>
                <button type="button" className="u-icon-btn" onClick={() => setFailed([])} aria-label={d.common.close}><Icon name="close" size={15} /></button>
              </div>
              <ul>{failed.map((f) => <li key={f.itemId}>{f.message}</li>)}</ul>
            </div>
          )}

          <OrderItems order={order} now={now} busy={busy} requireVoidReason={requireVoidReason} onAction={onItemAction} />

          {order.payments.length > 0 && (
            <section className="rt-block rt-pays" aria-labelledby="rt-pays-t">
              <div className="rt-block-head"><h3 id="rt-pays-t">{k.paymentsTitle}</h3></div>
              <ul>
                {order.payments.map((p) => (
                  <li key={p.checkoutId}>
                    <span className="rt-pay-main">
                      <b>{fmtMoney(p.total)} {d.common.sum}</b>
                      <small suppressHydrationWarning>{hhmm(p.paidAt)} · {p.parts.map((x) => d.sales.payMethods[x.method as keyof typeof d.sales.payMethods] ?? x.method).join(', ')}{p.serviceCharge > 0 ? ` · ${k.serviceCharge} ${fmtMoney(p.serviceCharge)}` : ''}</small>
                    </span>
                    {p.saleIds.length > 0 && (
                      <a className="btn btn-ghost btn-sm" href={`/app/sales/receipt?ids=${p.saleIds.join(',')}`} target="_blank" rel="noopener">{k.receipt}</a>
                    )}
                    <a className="btn btn-plain btn-sm" href={p.publicPath} target="_blank" rel="noopener">{k.publicReceipt}</a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="rt-panel-foot">
          <dl className="rt-sum rt-sum--compact">
            {(b.counts.items > 0 || b.paid > 0) && (
              <div><dt>{b.paid > 0 ? k.subtotalDue : k.subtotal}</dt><dd>{fmtMoney(b.dueSubtotal)}</dd></div>
            )}
            {b.servicePct > 0 && b.dueSubtotal > 0 && <div><dt>{tr(c.serviceChargeLine, { pct: b.servicePct })}</dt><dd>{fmtMoney(b.dueServiceCharge)}</dd></div>}
            {b.duePackFee > 0 && <div><dt>{c.packFeeLine}</dt><dd>{fmtMoney(b.duePackFee)}</dd></div>}
            {b.paid > 0 && <div className="is-muted"><dt>{k.paid}</dt><dd>{fmtMoney(b.paid)}</dd></div>}
            <div className="rt-sum-total"><dt>{closed ? k.total : k.due}</dt><dd>{fmtMoney(closed ? b.total : b.due)} <small>{d.common.sum}</small></dd></div>
          </dl>
          {!closed ? (
            <div className="rt-foot-acts">
              {(can?.precheck || order.status === 'precheck') && (
                <button type="button" className="btn btn-ghost btn-with-icon" onClick={precheck} disabled={!!busy || (order.status === 'open' && b.counts.items === 0)}>
                  <Icon name="clipboard" size={17} />
                  {busy === 'precheck' ? d.common.loading : order.status === 'precheck' ? k.precheckPrint : k.precheck}
                </button>
              )}
              {can?.pay && (
                <button type="button" className="btn btn-primary rt-pay-btn" onClick={() => setDialog({ kind: 'pay' })} disabled={!!busy || b.due <= 0}>
                  <span>{k.pay}</span>
                  <b>{fmtMoney(b.due)}</b>
                </button>
              )}
            </div>
          ) : (
            <Link href={backHref} className="btn btn-primary btn-full">{k.backToTables}</Link>
          )}
        </div>
      </aside>

      {showMenu && tab === 'menu' && cart.length > 0 && (
        <button type="button" className="rt-cartbar" onClick={() => setTab('order')}>
          <span><Icon name="cart" size={18} />{tr(k.cartN, { n: cart.length })}</span>
          <b>{fmtMoney(cartTotal)} {d.common.sum}</b>
        </button>
      )}

      {printKey > 0 && (
        <iframe key={printKey} src={`/app/tables/${order.id}/precheck?print=1`} title={k.precheck} className="rt-print-frame" aria-hidden="true" tabIndex={-1} />
      )}

      {dialog?.kind === 'mod' && (
        <ModifierDialog
          item={dialog.item}
          onClose={() => setDialog(null)}
          onAdd={(p) => { addLine(dialog.item, p); setDialog(null); }}
        />
      )}
      {dialog?.kind === 'void' && voidItem && (
        <VoidDialog order={order} item={voidItem} requireVoidReason={requireVoidReason} busy={!!busy} run={run} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'info' && <InfoDialog order={order} busy={!!busy} run={run} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'transfer' && <TransferDialog order={order} busy={!!busy} run={run} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'cancel' && <CancelDialog order={order} busy={!!busy} run={run} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'reopen' && (
        <ConfirmDialog title={k.reopen} text={k.reopenHint} confirmLabel={k.reopen} busy={!!busy} onConfirm={reopen} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'pay' && (
        <PayDialog
          order={order}
          busy={busy === 'pay'}
          run={run}
          onClose={() => setDialog(null)}
          onFailed={setFailed}
          shopName={shopName}
          backHref={backHref}
        />
      )}
    </div>
  );
}
