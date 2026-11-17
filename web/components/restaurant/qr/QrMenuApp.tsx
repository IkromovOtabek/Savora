'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/icons/Icon';
import LangSwitch from '@/components/LangSwitch';
import { useI18n } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { fmtMoney } from '@/lib/format';
import { toast } from '@/lib/toast';
import { serviceChargeAmount } from '@/lib/restaurant/bill';
import type { PublicMenu, PublicOrderStatus } from '@/lib/restaurant/public';
import type { TableCallKind } from '@/lib/restaurant/types';
import { qrApi } from './api';
import {
  MAX_LINES, MAX_QTY, addLine, cartSignature, lineTotal, newClientOrderId, onColor, sanitizeLines,
  type CartLine, type MenuItem,
} from './cart';
import CartSheet, { type CartSummary, type ServiceMode } from './CartSheet';
import ItemSheet from './ItemSheet';
import OrderStatus from './OrderStatus';
import QrState from './QrState';
import Sheet from './Sheet';
import './qr-menu.css';

/** Buyurtma holati: faol taom bor — tez, yo'q — sekinroq (restoran Wi-Fi'da hamma bitta IP — rate-limit 120/daq) */
const POLL_ACTIVE_MS = 12_000;
const POLL_IDLE_MS = 30_000;
/** Chaqiruvdan keyin tugma o'chiq turadi (server: stolga 6 ta / 5 daq) */
const CALL_COOLDOWN_MS = 60_000;
/** Savat xatosida menyuni serverdan qayta olish kerak bo'lgan kodlar (taom o'chdi / tugadi) */
const STALE_MENU_CODES = new Set(['productNotFound', 'stopListed', 'outOfStock', 'badModifiers']);

type Cooldown = { until: number; ok: boolean };
type Calls = Partial<Record<TableCallKind, Cooldown>>;
type Pending = { id: string; sig: string };
interface Stored {
  v: 1;
  lines: unknown;
  /** Javobi kelmagan buyurtma kaliti — qayta bosilsa shu yuboriladi (server ikkinchi marta yozmaydi) */
  pending: Pending | null;
  /** Shu qurilma ochgan buyurtma raqami (QR o'zi buyurtma → xizmat haqi 0%) */
  own: string | null;
  calls: Calls;
}

function readStore(key: string): Partial<Stored> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Stored>;
    return v && v.v === 1 ? v : null;
  } catch {
    return null;
  }
}

function writeStore(key: string, v: Stored) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* xususiy rejim / to'lgan xotira */ }
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function hasActiveItems(s: PublicOrderStatus): boolean {
  return s.items.some((i) => i.status !== 'served' && i.status !== 'voided');
}

interface Section { id: string; name: string; items: MenuItem[] }

export default function QrMenuApp({
  slug,
  token,
  menu,
  initialStatus,
}: {
  slug: string;
  token: string;
  menu: PublicMenu;
  initialStatus: PublicOrderStatus;
}) {
  const { d } = useI18n();
  const q = d.restaurant.qrMenu;
  const router = useRouter();
  const api = useMemo(() => qrApi(slug, token), [slug, token]);
  const storageKey = `savora:qr:${slug}:${token}`;

  const itemsById = useMemo(() => new Map(menu.items.map((i) => [i.id, i])), [menu.items]);
  const sections = useMemo<Section[]>(() => {
    const by = new Map<string, MenuItem[]>();
    for (const it of menu.items) {
      const k = it.category ?? '';
      const list = by.get(k);
      if (list) list.push(it);
      else by.set(k, [it]);
    }
    const out: Section[] = menu.categories.filter((c) => by.has(c)).map((c, i) => ({ id: `qm-cat-${i}`, name: c, items: by.get(c)! }));
    const rest = by.get('');
    if (rest) out.push({ id: 'qm-cat-other', name: out.length ? q.otherCategory : q.title, items: rest });
    return out;
  }, [menu.items, menu.categories, q.otherCategory, q.title]);

  const [lines, setLines] = useState<CartLine[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [own, setOwn] = useState<string | null>(null);
  const [calls, setCalls] = useState<Calls>({});
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<PublicOrderStatus>(initialStatus);
  const [refreshing, setRefreshing] = useState(false);
  const [gone, setGone] = useState(false);
  const [openItem, setOpenItem] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placedNo, setPlacedNo] = useState<string | null>(null);
  const [cartError, setCartError] = useState('');
  const [busyCall, setBusyCall] = useState<TableCallKind | null>(null);
  const [now, setNow] = useState(0);
  const [active, setActive] = useState('');
  const navRef = useRef<HTMLElement>(null);
  const linesRef = useRef(lines);
  const loadedRef = useRef(false);
  const pollRef = useRef<((ms: number) => void) | null>(null);
  // Tez ikki marta bosish: holat yangilanguncha ikkinchi so'rov (yangi kalit bilan) ketmasin
  const placingRef = useRef(false);
  const callingRef = useRef(false);

  useEffect(() => { linesRef.current = lines; }, [lines]);

  const money = useCallback((n: number) => `${fmtMoney(n)} ${d.common.sum}`, [d.common.sum]);
  const unitSuffix = useCallback((u: string | null) => {
    if (!u || u === 'dona') return '';
    const label = (d.stock.fields.units as Record<string, string>)[u] ?? u;
    return ` ${tr(q.perUnit, { unit: label })}`;
  }, [d.stock.fields.units, q.perUnit]);

  /* ── Savat: qurilmada saqlanadi; menyu o'zgarsa (stop-list, til) — moslashtiriladi ── */
  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      const s = readStore(storageKey);
      const r = sanitizeLines(s?.lines, itemsById);
      setLines(r.lines);
      setPending(s?.pending && typeof s.pending.id === 'string' ? s.pending : null);
      setOwn(typeof s?.own === 'string' ? s.own : null);
      setCalls(s?.calls && typeof s.calls === 'object' ? s.calls : {});
      setHydrated(true);
      // Toaster shu commit'da keyinroq tinglay boshlaydi
      if (r.pruned) setTimeout(() => toast(q.cartPruned, 'info'), 0);
      return;
    }
    const r = sanitizeLines(linesRef.current, itemsById);
    if (r.pruned) {
      setLines(r.lines);
      toast(q.cartPruned, 'info');
    }
  }, [itemsById, storageKey, q.cartPruned]);

  useEffect(() => {
    if (hydrated) writeStore(storageKey, { v: 1, lines, pending, own, calls });
  }, [hydrated, storageKey, lines, pending, own, calls]);

  /* ── «Buyurtmangiz» polling: faqat sahifa ko'rinib turganda ── */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    let inflight = false;
    const schedule = (ms: number) => {
      clearTimeout(timer);
      if (alive && document.visibilityState === 'visible') timer = setTimeout(tick, ms);
    };
    async function tick() {
      if (!alive || inflight || document.visibilityState !== 'visible') return;
      inflight = true;
      const r = await api.orderStatus();
      inflight = false;
      if (!alive) return;
      if (r.ok) {
        setStatus(r.data);
        schedule(hasActiveItems(r.data) ? POLL_ACTIVE_MS : POLL_IDLE_MS);
      } else if (r.code === 'qrUnavailable') {
        setGone(true);
      } else {
        schedule(r.code === 'rateLimited' ? r.retryAfter * 1000 : POLL_IDLE_MS);
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
      else clearTimeout(timer);
    };
    pollRef.current = schedule;
    document.addEventListener('visibilitychange', onVisible);
    schedule(hasActiveItems(initialStatus) ? POLL_ACTIVE_MS : POLL_IDLE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
      pollRef.current = null;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [api, initialStatus]);

  const refreshStatus = useCallback(async () => {
    setRefreshing(true);
    const r = await api.orderStatus();
    setRefreshing(false);
    if (r.ok) setStatus(r.data);
    else if (r.code === 'qrUnavailable') setGone(true);
    else if (r.code === 'rateLimited') toast(tr(q.rateLimitedWait, { s: r.retryAfter }), 'warn');
    else toast(r.code === 'network' ? q.network : r.error || d.restaurant.errors.failed, 'error');
  }, [api, q.rateLimitedWait, q.network, d.restaurant.errors.failed]);

  /* ── Ofitsant / hisob chaqiruvi: bosilgandan keyin vaqtincha o'chiq ── */
  useEffect(() => {
    const until = Math.max(0, ...Object.values(calls).map((c) => c?.until ?? 0));
    if (until <= Date.now()) return;
    setNow(Date.now());
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= until) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [calls]);

  async function callStaff(kind: TableCallKind) {
    const cd = calls[kind];
    if (callingRef.current || (cd && cd.until > Date.now())) return;
    callingRef.current = true;
    setBusyCall(kind);
    const r = await api.callStaff(kind);
    callingRef.current = false;
    setBusyCall(null);
    if (r.ok) {
      setCalls((c) => ({ ...c, [kind]: { until: Date.now() + CALL_COOLDOWN_MS, ok: true } }));
      toast(kind === 'waiter' ? q.called : q.billRequested, 'success');
    } else if (r.code === 'rateLimited') {
      setCalls((c) => ({ ...c, [kind]: { until: Date.now() + r.retryAfter * 1000, ok: false } }));
      toast(tr(q.rateLimitedWait, { s: r.retryAfter }), 'warn');
    } else if (r.code === 'qrUnavailable') {
      setGone(true);
    } else {
      toast(r.code === 'network' ? q.network : r.error || d.restaurant.errors.failed, 'error');
    }
  }

  /* ── Savat amallari ── */
  function addToCart(next: { productId: string; qty: number; optionIds: string[]; note: string }) {
    const res = addLine(lines, next);
    if (res.full) {
      toast(tr(q.cartFull, { n: MAX_LINES }), 'warn');
      return;
    }
    setLines(res.lines);
    setCartError('');
    setOpenItem(null);
    toast(res.capped ? tr(q.maxQty, { n: MAX_QTY }) : q.added, res.capped ? 'warn' : 'success');
  }

  function setQty(key: string, qty: number) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, qty: Math.max(1, Math.min(MAX_QTY, qty)) } : l)));
    setCartError('');
  }

  function removeLine(key: string) {
    setLines((ls) => ls.filter((l) => l.key !== key));
    setCartError('');
  }

  async function placeOrder() {
    if (placingRef.current || !lines.length) return;
    placingRef.current = true;
    setCartError('');
    const sig = cartSignature(lines);
    // Savat o'zgarmagan bo'lsa — avvalgi kalit (javobi kelmagan so'rov takrorlansa, server qayta yozmaydi)
    const key: Pending = pending && pending.sig === sig ? pending : { id: newClientOrderId(), sig };
    setPending(key);
    const hadOrder = !!status.orderNo;
    setPlacing(true);
    const r = await api.placeOrder({
      clientOrderId: key.id,
      items: lines.map((l) => ({
        productId: l.productId,
        qty: l.qty,
        ...(l.optionIds.length ? { optionIds: l.optionIds } : {}),
        ...(l.note ? { note: l.note } : {}),
      })),
    });
    placingRef.current = false;
    setPlacing(false);
    if (r.ok) {
      const { added: _added, ...next } = r.data;
      setStatus(next);
      if (!hadOrder && next.orderNo) setOwn(next.orderNo);
      setPending(null);
      setLines([]);
      setPlacedNo(next.orderNo ?? '');
      pollRef.current?.(POLL_ACTIVE_MS);
      return;
    }
    if (r.code === 'qrUnavailable') {
      setCartOpen(false);
      setGone(true);
      return;
    }
    if (r.code === 'network') setCartError(q.network);
    else if (r.code === 'rateLimited') setCartError(tr(q.rateLimitedWait, { s: r.retryAfter }));
    else if (r.code === 'orderLocked') setCartError(q.orderLocked);
    else setCartError(r.error || d.restaurant.errors.failed);
    if (STALE_MENU_CODES.has(r.code)) router.refresh();
  }

  const closeCart = useCallback(() => {
    setCartOpen(false);
    setPlacedNo(null);
  }, []);

  function showOrder() {
    closeCart();
    requestAnimationFrame(() => {
      const el = document.getElementById('qm-order');
      el?.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
      el?.focus({ preventScroll: true });
    });
  }

  /* ── Kategoriya tablari: bosilsa — bo'limga, aylantirilsa — faol tab ── */
  useEffect(() => {
    if (sections.length < 2) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const edge = (navRef.current?.getBoundingClientRect().bottom ?? 0) + 16;
        let cur = sections[0].id;
        for (const s of sections) {
          const el = document.getElementById(s.id);
          if (el && el.getBoundingClientRect().top <= edge) cur = s.id;
        }
        setActive(cur);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [sections]);

  useEffect(() => {
    const nav = navRef.current?.querySelector<HTMLElement>('.qm-tabs-scroll');
    const tab = nav?.querySelector<HTMLElement>(`[data-sec="${active}"]`);
    if (nav && tab) nav.scrollTo({ left: tab.offsetLeft - nav.clientWidth / 2 + tab.offsetWidth / 2, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [active]);

  function jumpTo(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    const navH = navRef.current?.offsetHeight ?? 0;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - navH - 4, behavior: reducedMotion() ? 'auto' : 'smooth' });
    setActive(id);
  }

  /* ── Hisob-kitob ── */
  const qtyByProduct = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) m.set(l.productId, (m.get(l.productId) ?? 0) + l.qty);
    return m;
  }, [lines]);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const pct = menu.serviceChargePct;
  // Xizmat haqi faqat ofitsant ochgan (zal) buyurtmada; QR orqali o'zi ochilgan buyurtmada — 0% (bill.ts)
  const mode: ServiceMode =
    pct <= 0 ? 'none'
      : !status.orderNo ? 'self'
        : status.serviceCharge > 0 ? 'yes'
          : status.due > 0 || own === status.orderNo ? 'self'
            : 'maybe';
  const subtotal = lines.reduce((s, l) => {
    const it = itemsById.get(l.productId);
    return it ? s + lineTotal(it, l) : s;
  }, 0);
  const service = mode === 'yes' || mode === 'maybe' ? serviceChargeAmount(subtotal, pct) : 0;
  const summary: CartSummary = { subtotal, service, total: subtotal + service, pct, mode };

  if (gone) {
    return (
      <QrState
        title={q.notFoundTitle}
        text={q.notFoundText}
        action={<button type="button" className="qm-btn qm-btn--ghost" onClick={() => window.location.reload()}>{d.common.retry}</button>}
      />
    );
  }

  const brandStyle = menu.brand.color
    ? ({ '--qm-brand': menu.brand.color, '--qm-on-brand': onColor(menu.brand.color) } as CSSProperties)
    : undefined;

  return (
    <div className="qm-root" style={brandStyle}>
      <header className={`qm-hero${menu.brand.coverUrl ? '' : ' qm-hero--plain'}`}>
        {menu.brand.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- tashqi (R2/CDN) rasm
          <img className="qm-hero-img" src={menu.brand.coverUrl} alt="" fetchPriority="high" decoding="async" />
        ) : null}
        <div className="qm-lang"><LangSwitch compact /></div>
      </header>

      <div className="qm-wrap">
        <section className="qm-head" aria-labelledby="qm-org-name">
          <Logo url={menu.brand.logoUrl} name={menu.org.name} />
          <div className="qm-head-text">
            <h1 id="qm-org-name">{menu.org.name}</h1>
            <p className="qm-table">
              <strong>{tr(q.tableNo, { n: menu.table.number })}</strong>
              {menu.table.hall ? <span>{menu.table.hall}</span> : null}
            </p>
          </div>
        </section>

        {pct > 0 ? (
          <p className="qm-service" role="note">
            <span className="qm-service-badge">{tr(q.serviceBadge, { pct })}</span>
            <span>{tr(q.serviceNote, { pct })}</span>
          </p>
        ) : null}

        <div className="qm-actions">
          {(['waiter', 'bill'] as const).map((kind) => {
            const cd = calls[kind];
            const left = cd && cd.until > now ? Math.ceil((cd.until - now) / 1000) : 0;
            const label = left > 0 && cd?.ok
              ? (kind === 'waiter' ? q.called : q.billRequested).replace(/\.$/, '')
              : kind === 'waiter' ? q.callWaiter : q.requestBill;
            return (
              <button
                key={kind}
                type="button"
                className="qm-action"
                onClick={() => callStaff(kind)}
                disabled={busyCall === kind || left > 0}
                aria-busy={busyCall === kind}
              >
                <span className="qm-action-ic" aria-hidden><Icon name={kind === 'waiter' ? 'bell' : 'wallet'} size={18} /></span>
                <span className="qm-action-text">
                  {label}
                  {left > 0 ? (
                    <small>{left >= 60 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : tr(q.waitSec, { s: left })}</small>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>

        {status.items.length ? (
          <OrderStatus status={status} money={money} refreshing={refreshing} onRefresh={refreshStatus} />
        ) : null}
      </div>

      {sections.length > 1 ? (
        <nav ref={navRef} className="qm-tabs" aria-label={q.categoriesAria}>
          <div className="qm-tabs-scroll">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                className="qm-tab"
                data-sec={s.id}
                aria-current={active === s.id ? 'true' : undefined}
                onClick={() => jumpTo(s.id)}
              >
                {s.name}
              </button>
            ))}
          </div>
        </nav>
      ) : null}

      <main className="qm-wrap qm-menu">
        {!sections.length ? (
          <div className="qm-empty">
            <Icon name="utensils" size={28} />
            <p className="qm-empty-title">{q.empty}</p>
          </div>
        ) : sections.map((s) => (
          <section key={s.id} id={s.id} className="qm-section" aria-labelledby={`${s.id}-h`}>
            <h2 id={`${s.id}-h`}>{s.name}</h2>
            <div className="qm-items">
              {s.items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  qty={qtyByProduct.get(item.id) ?? 0}
                  price={`${money(item.price)}${unitSuffix(item.unit)}`}
                  optionsLabel={q.hasOptions}
                  inCartLabel={q.inCart}
                  onOpen={() => setOpenItem(item)}
                />
              ))}
            </div>
          </section>
        ))}
      </main>

      {count > 0 ? (
        <div className="qm-bar">
          <button
            type="button"
            className="qm-bar-btn"
            onClick={() => { setPlacedNo(null); setCartOpen(true); }}
            aria-label={`${q.openCart}: ${tr(q.cartCount, { n: count })}, ${money(subtotal)}`}
          >
            <span className="qm-bar-count" aria-hidden>{count}</span>
            <span aria-hidden>{q.cart}</span>
            <span className="qm-bar-sum tnum" aria-hidden>{money(subtotal)}</span>
          </button>
        </div>
      ) : null}

      <Sheet open={!!openItem} onClose={() => setOpenItem(null)} labelledBy={openItem ? `qm-item-title-${openItem.id}` : 'qm-org-name'}>
        {openItem ? (
          <ItemSheet
            key={openItem.id}
            item={openItem}
            money={money}
            priceSuffix={unitSuffix(openItem.unit)}
            onAdd={addToCart}
            onClose={() => setOpenItem(null)}
          />
        ) : null}
      </Sheet>

      <Sheet open={cartOpen} onClose={closeCart} labelledBy="qm-cart-title">
        <CartSheet
          lines={lines}
          items={itemsById}
          summary={summary}
          money={money}
          placing={placing}
          error={cartError}
          placedNo={placedNo}
          onQty={setQty}
          onRemove={removeLine}
          onPlace={placeOrder}
          onClose={closeCart}
          onShowOrder={showOrder}
        />
      </Sheet>
    </div>
  );
}

function Logo({ url, name }: { url: string | null; name: string }) {
  const [ok, setOk] = useState(!!url);
  if (url && ok) {
    // eslint-disable-next-line @next/next/no-img-element -- tashqi (R2/CDN) rasm
    return <img className="qm-logo" src={url} alt="" width={64} height={64} decoding="async" onError={() => setOk(false)} />;
  }
  return <span className="qm-logo qm-logo--letter" aria-hidden>{name.trim().charAt(0).toUpperCase() || '•'}</span>;
}

function ItemCard({
  item,
  qty,
  price,
  optionsLabel,
  inCartLabel,
  onOpen,
}: {
  item: MenuItem;
  qty: number;
  price: string;
  optionsLabel: string;
  inCartLabel: string;
  onOpen: () => void;
}) {
  const [photoOk, setPhotoOk] = useState(!!item.photoUrl);
  const photo = photoOk && item.photoUrl;
  return (
    <button type="button" className={`qm-item${photo ? '' : ' qm-item--nophoto'}`} onClick={onOpen} aria-haspopup="dialog">
      <span className="qm-item-body">
        <span className="qm-item-name">{item.name}</span>
        {item.modifierGroups.length ? <span className="qm-item-meta">{optionsLabel}</span> : null}
        <span className="qm-item-price tnum">{price}</span>
      </span>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- tashqi (R2/CDN) rasm, lazy
        <img className="qm-item-photo" src={item.photoUrl!} alt="" width={96} height={96} loading="lazy" decoding="async" onError={() => setPhotoOk(false)} />
      ) : null}
      {qty > 0 ? (
        <span className="qm-item-qty">
          <span aria-hidden>{qty}</span>
          <span className="sr-only">{tr(inCartLabel, { n: qty })}</span>
        </span>
      ) : null}
      <span className="qm-item-add" aria-hidden><Icon name="plus" size={18} strokeWidth={2.5} /></span>
    </button>
  );
}
