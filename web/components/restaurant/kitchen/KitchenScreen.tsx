'use client';

/**
 * Oshxona ekrani (KDS) — planshet/TV. Ma'lumot: GET /api/restaurant/kitchen polling (`since` = oldingi
 * javob `next`, id bo'yicha almashtirish, `items: []` — kartochka olib tashlanadi). Holat belgilash —
 * `bumpItemsAction`. Bekor qilingan taom — javobdagi `orders[].voided` (sabab bilan; alohida so'rov yo'q).
 * Hisob-kitob sof funksiyalarda: ./kdsLogic.ts (tests/kitchenKds.test.ts).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { toast } from '@/lib/toast';
import { bumpItemsAction } from '@/app/actions/restaurant';
import type { KitchenBoard, KdsOrder } from '@/lib/restaurant/queries';
import type { BumpTarget } from '@/lib/restaurant/rules';
import {
  KDS_FULL_SYNC_MS,
  KDS_HIDDEN_RESET_MS,
  KDS_NEW_HIGHLIGHT_MS,
  KDS_POLL_MAX_MS,
  KDS_POLL_MS,
  KDS_READY_WINDOW_MIN,
  KDS_VOID_TTL_MS,
  clockHHMM,
  isActiveItem,
  kdsCounts,
  kdsOrderFromView,
  kdsThresholds,
  mergeBoard,
  readyGroups,
  voidedMapOf,
  type KdsMerge,
  type KdsThresholds,
} from './kdsLogic';
import { readStore, useKdsSound, useKiosk, useWakeLock, writeStore } from './kdsDevice';
import { KdsCard, KdsReadyCard, orderLabel, type KdsReduced, type KdsVoidedEntry } from './KdsCards';

type TextSize = 'md' | 'lg' | 'xl';
const SIZES: readonly TextSize[] = ['md', 'lg', 'xl'];

interface Prefs {
  sound: boolean;
  showReady: boolean;
  size: TextSize;
  wake: boolean;
}
const DEFAULT_PREFS: Prefs = { sound: true, showReady: true, size: 'md', wake: true };
const PREFS_KEY = 'savora.kds.prefs';
const STATION_KEY = 'savora.kds.station';
const BRANCH_KEY = 'savora.kds.branch';
const HEX24 = /^[a-f0-9]{24}$/i;

function parsePrefs(raw: string | null): Prefs {
  try {
    const p = JSON.parse(raw ?? 'null') as Partial<Prefs> | null;
    if (!p || typeof p !== 'object') return DEFAULT_PREFS;
    return {
      sound: typeof p.sound === 'boolean' ? p.sound : DEFAULT_PREFS.sound,
      showReady: typeof p.showReady === 'boolean' ? p.showReady : DEFAULT_PREFS.showReady,
      size: SIZES.includes(p.size as TextSize) ? (p.size as TextSize) : DEFAULT_PREFS.size,
      wake: typeof p.wake === 'boolean' ? p.wake : DEFAULT_PREFS.wake,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** loading — birinchi so'rov; live — ishlayapti; offline — aloqa uzildi (eski ma'lumot ko'rinadi);
 *  error — birinchi so'rov o'xshamadi; auth — sessiya tugagan; denied — modul/huquq yo'q */
type Phase = 'loading' | 'live' | 'offline' | 'error' | 'auth' | 'denied';

interface Meta {
  stations: KitchenBoard['stations'];
  branches: KitchenBoard['branches'];
  th: KdsThresholds;
}

type Reduced = KdsReduced & { orderId: string };
interface Fresh { orders: Record<string, number>; items: Record<string, number> }

interface CommitOpts {
  alert: boolean;
  /** Javobdagi bekor qilingan taomlar (id → sabab): polling — `orders[].voided`, bump — buyurtma ko'rinishi */
  voided: Map<string, string | null>;
}

export interface KitchenScreenProps {
  canBump: boolean;
  isAdmin: boolean;
  /** URL'dagi tanlov (`?station=`, `?branch=`) — bo'lmasa localStorage'dan */
  urlStation: string;
  urlBranch: string;
}

/* Ikonkalar (umumiy Icon to'plamida yo'qlari) */
const SoundIcon = ({ on }: { on: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M11 5 6 9H2v6h4l5 4V5z" />
    {on ? <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /> : <path d="m22 9-6 6M16 9l6 6" />}
  </svg>
);
const ExpandIcon = ({ out }: { out: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {out
      ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
      : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
  </svg>
);

export default function KitchenScreen({ canBump, isAdmin, urlStation, urlBranch }: KitchenScreenProps) {
  const d = useDict();
  const k = d.restaurant.kitchen;

  const [hydrated, setHydrated] = useState(false);
  const [station, setStation] = useState(urlStation);
  const [branchId, setBranchId] = useState(urlBranch);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [orders, setOrders] = useState<KdsOrder[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [phaseMsg, setPhaseMsg] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [now, setNow] = useState(0);
  const [voided, setVoided] = useState<KdsVoidedEntry[]>([]);
  const [reduced, setReduced] = useState<Record<string, Reduced>>({});
  const [fresh, setFresh] = useState<Fresh>({ orders: {}, items: {} });
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const [announce, setAnnounce] = useState('');
  const [confirmServe, setConfirmServe] = useState<string | null>(null);
  const [showOlder, setShowOlder] = useState(false);

  const ordersRef = useRef<KdsOrder[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const nextRef = useRef<string | null>(null);
  const lastFullRef = useRef(0);
  const offsetRef = useRef(0);
  const genRef = useRef(0);
  const selfServedRef = useRef<Set<string>>(new Set());
  const thRef = useRef<KdsThresholds>(kdsThresholds());
  const pokeRef = useRef<() => void>(() => {});

  const { beep, unlock, locked } = useKdsSound(prefs.sound);
  const wake = useWakeLock(prefs.wake);
  const { kiosk, toggle: toggleKiosk } = useKiosk();

  /** Server soati (planshet soati noto'g'ri bo'lsa ham taymer to'g'ri) */
  const clock = useCallback(() => Date.now() + offsetRef.current, []);

  /* ── tanlovlarni tiklash (URL ustun, keyin localStorage) ── */
  useEffect(() => {
    setPrefs(parsePrefs(readStore(PREFS_KEY)));
    if (!urlStation) {
      const s = readStore(STATION_KEY);
      if (s && HEX24.test(s)) setStation(s);
    }
    if (isAdmin && !urlBranch) {
      const b = readStore(BRANCH_KEY);
      if (b && HEX24.test(b)) setBranchId(b);
    }
    setHydrated(true);
  }, [urlStation, urlBranch, isAdmin]);

  useEffect(() => {
    if (hydrated) writeStore(PREFS_KEY, JSON.stringify(prefs));
  }, [prefs, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    writeStore(STATION_KEY, station || null);
    if (isAdmin) writeStore(BRANCH_KEY, branchId || null);
    const url = new URL(window.location.href);
    if (station) url.searchParams.set('station', station);
    else url.searchParams.delete('station');
    if (isAdmin && branchId) url.searchParams.set('branch', branchId);
    else url.searchParams.delete('branch');
    if (url.href !== window.location.href) window.history.replaceState(null, '', url.pathname + url.search);
  }, [station, branchId, hydrated, isAdmin]);

  /* ── javobni ekranga qo'shish: signal, ajratish, bekor/kamaygan taomlar ── */
  const addVoided = useCallback((list: KdsVoidedEntry[]) => {
    if (!list.length) return;
    setVoided((v) => [...v.filter((x) => !list.some((g) => g.item.id === x.item.id)), ...list]);
    setAnnounce(list.map((g) => `${orderLabel(g.order, d)}: ${k.voidedWarn}`).join('. '));
  }, [d, k.voidedWarn]);

  const commit = useCallback((m: KdsMerge, opts: CommitOpts) => {
    ordersRef.current = m.orders;
    setOrders(m.orders);
    for (const o of m.orders) for (const i of o.items) seenRef.current.add(i.id);
    const t = clock();

    if (opts.alert && m.added.length) {
      const until = t + KDS_NEW_HIGHLIGHT_MS;
      setFresh((f) => {
        const next: Fresh = { orders: { ...f.orders }, items: { ...f.items } };
        for (const a of m.added) {
          if (a.newOrder) next.orders[a.orderId] = until;
          for (const id of a.itemIds) next.items[id] = until;
        }
        return next;
      });
      beep();
      setAnnounce(m.added.map((a) => {
        const o = m.orders.find((x) => x.id === a.orderId);
        const label = o ? orderLabel(o, d) : '';
        return a.newOrder ? tr(k.announceOrder, { label }) : tr(k.announceItems, { label, n: a.itemIds.length });
      }).join('. '));
    }
    if (m.reduced.length) {
      setReduced((r) => {
        const next = { ...r };
        for (const x of m.reduced) next[x.itemId] = { orderId: x.orderId, from: r[x.itemId]?.from ?? x.from, to: x.to, at: t };
        return next;
      });
    }

    // Ekrandan yo'qolgan taom: berildi (o'zimiz yoki ofitsant) yoki bekor qilindi — javobdagi `voided` dan
    const map = opts.voided;
    const lost = m.vanished.filter((v) => !selfServedRef.current.has(v.item.id) && map.has(v.item.id));
    if (!lost.length) return;
    addVoided(lost.map((v) => ({ ...v, reason: map.get(v.item.id) ?? null, at: t })));
    if (opts.alert) beep();
  }, [clock, beep, d, k.announceOrder, k.announceItems, addVoided]);

  const commitRef = useRef(commit);
  useEffect(() => { commitRef.current = commit; }, [commit]);

  /* ── polling ── */
  useEffect(() => {
    if (!hydrated) return;
    genRef.current++; // stansiya/filial almashdi — kechikkan bump javobi yangi ekranga tushmasin
    ordersRef.current = [];
    seenRef.current = new Set();
    selfServedRef.current = new Set();
    nextRef.current = null;
    lastFullRef.current = 0;
    setOrders([]);
    setVoided([]);
    setReduced({});
    setFresh({ orders: {}, items: {} });
    setPhase('loading');

    let timer: number | undefined;
    let ctrl: AbortController | null = null;
    let failures = 0;
    let stopped = false;
    let initial = true;
    let inflight = false;
    let hiddenAt = 0;

    const schedule = (ms: number) => {
      window.clearTimeout(timer);
      if (!stopped && !document.hidden) timer = window.setTimeout(() => void tick(), ms);
    };

    async function tick() {
      if (stopped || document.hidden || inflight) return;
      inflight = true;
      const full = !nextRef.current || Date.now() - lastFullRef.current > KDS_FULL_SYNC_MS;
      const qs = new URLSearchParams();
      if (station) qs.set('stationId', station);
      if (branchId) qs.set('branchId', branchId);
      if (!full && nextRef.current) qs.set('since', nextRef.current);
      ctrl = new AbortController();
      try {
        const res = await fetch(`/api/restaurant/kitchen?${qs}`, {
          cache: 'no-store',
          signal: ctrl.signal,
          headers: { accept: 'application/json' },
        });
        const body = (await res.json().catch(() => null)) as (KitchenBoard & { error?: string; code?: string }) | null;
        if (stopped) return;
        if (!res.ok || !body) {
          if (res.status === 401) {
            stopped = true;
            setPhase('auth');
            return;
          }
          if (res.status === 403) {
            stopped = true;
            setPhaseMsg(body?.error ?? '');
            setPhase('denied');
            return;
          }
          if (body?.code === 'badBranch' && branchId) {
            setBranchId('');
            return;
          }
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        const st = Date.parse(body.serverTime);
        if (Number.isFinite(st)) offsetRef.current = st - Date.now();
        nextRef.current = body.next;
        if (full) lastFullRef.current = Date.now();
        const th = kdsThresholds(body.settings);
        thRef.current = th;
        setMeta({ stations: body.stations, branches: body.branches, th });
        // Tanlangan stansiya o'chirilgan/boshqa filialniki — «Hammasi»ga qaytamiz
        if (station && !body.stations.some((s) => s.id === station)) {
          setStation('');
          return;
        }
        commitRef.current(mergeBoard(ordersRef.current, body.orders, full ? 'full' : 'since', seenRef.current), { alert: !initial, voided: voidedMapOf(body.orders) });
        initial = false;
        failures = 0;
        setPhase('live');
        schedule(KDS_POLL_MS);
      } catch (e) {
        if (stopped || (e as Error)?.name === 'AbortError') return;
        failures++;
        setPhase(initial ? 'error' : 'offline');
        schedule(Math.min(KDS_POLL_MAX_MS, KDS_POLL_MS * 2 ** failures));
      } finally {
        inflight = false;
      }
    }

    pokeRef.current = () => schedule(0);
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        window.clearTimeout(timer);
        ctrl?.abort();
        return;
      }
      if (hiddenAt && Date.now() - hiddenAt > KDS_HIDDEN_RESET_MS) lastFullRef.current = 0;
      schedule(0);
    };
    const onOnline = () => schedule(0);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    void tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      ctrl?.abort();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      pokeRef.current = () => {};
    };
  }, [hydrated, station, branchId, reloadKey]);

  /* ── soat (har soniya) va eskirgan belgilarni tozalash ── */
  useEffect(() => {
    const tickNow = () => setNow(Date.now() + offsetRef.current);
    tickNow();
    const id = window.setInterval(tickNow, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const t = clock();
      setFresh((f) => {
        const o = Object.entries(f.orders).filter(([, u]) => u > t);
        const i = Object.entries(f.items).filter(([, u]) => u > t);
        if (o.length === Object.keys(f.orders).length && i.length === Object.keys(f.items).length) return f;
        return { orders: Object.fromEntries(o), items: Object.fromEntries(i) };
      });
      setVoided((v) => {
        const n = v.filter((x) => t - x.at < KDS_VOID_TTL_MS);
        return n.length === v.length ? v : n;
      });
      setReduced((r) => {
        const e = Object.entries(r).filter(([, x]) => t - x.at < KDS_VOID_TTL_MS);
        return e.length === Object.keys(r).length ? r : Object.fromEntries(e);
      });
    }, 5000);
    return () => window.clearInterval(id);
  }, [clock]);

  useEffect(() => {
    if (!confirmServe) return;
    const id = window.setTimeout(() => setConfirmServe(null), 3500);
    return () => window.clearTimeout(id);
  }, [confirmServe]);

  /* ── amallar ── */
  const bump = useCallback(async (order: KdsOrder, itemIds: string[], to: BumpTarget) => {
    if (!canBump || !itemIds.length) return;
    const gen = genRef.current;
    setBusy((b) => new Set([...b, ...itemIds]));
    try {
      const r = await bumpItemsAction(order.id, { itemIds, to });
      if (gen !== genRef.current) return;
      if (!r.ok) {
        toast(r.error, 'error');
        lastFullRef.current = 0; // holat boshqacha bo'lishi mumkin — to'liq qayta o'qish
        pokeRef.current();
        return;
      }
      if (to === 'served') for (const id of r.data.updated) selfServedRef.current.add(id);
      const v = kdsOrderFromView(r.data.order, station || null, clock(), thRef.current);
      commitRef.current(mergeBoard(ordersRef.current, [v.order], 'since', seenRef.current), { alert: true, voided: v.voided });
    } catch {
      toast(k.bumpFailed, 'error');
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        for (const id of itemIds) n.delete(id);
        return n;
      });
    }
  }, [canBump, station, clock, k.bumpFailed]);

  const onBump = useCallback((order: KdsOrder, itemIds: string[], to: BumpTarget) => { void bump(order, itemIds, to); }, [bump]);
  const onRecall = useCallback((order: KdsOrder, itemId: string) => { void bump(order, [itemId], 'cooking'); }, [bump]);
  const onServe = useCallback((order: KdsOrder, itemIds: string[]) => {
    // «Berildi» qaytarib bo'lmaydi — ikkinchi bosish bilan tasdiqlanadi
    if (confirmServe !== order.id) {
      setConfirmServe(order.id);
      return;
    }
    setConfirmServe(null);
    void bump(order, itemIds, 'served');
  }, [confirmServe, bump]);

  const onAck = useCallback((orderId: string) => {
    setVoided((v) => v.filter((x) => x.order.id !== orderId));
    setReduced((r) => Object.fromEntries(Object.entries(r).filter(([, x]) => x.orderId !== orderId)));
  }, []);

  const toggleSound = () => {
    const on = !prefs.sound;
    setPrefs((p) => ({ ...p, sound: on }));
    if (on) unlock(true); // teginish ichida — avtoplay cheklovi yo'q, tasdiq tovushi
  };

  /* ── ko'rinish uchun hisoblar ── */
  const th = meta?.th ?? thRef.current;
  const stations = meta?.stations ?? [];
  const branches = meta?.branches ?? [];
  const showStationTags = !station && stations.length > 1;
  const stationNames = useMemo(() => new Map(stations.map((s) => [s.id, s.name])), [stations]);
  const stationName = useCallback(
    (id: string | null) => (showStationTags && id ? stationNames.get(id) ?? null : null),
    [showStationTags, stationNames],
  );

  const cards = useMemo(() => {
    const byOrder = new Map<string, KdsVoidedEntry[]>();
    for (const v of voided) byOrder.set(v.order.id, [...(byOrder.get(v.order.id) ?? []), v]);
    const ghosts: { order: KdsOrder; items: KdsOrder['items']; voided: KdsVoidedEntry[]; readyCount: number }[] = [];
    const list: typeof ghosts = [];
    for (const o of orders) {
      const items = o.items.filter(isActiveItem);
      const v = byOrder.get(o.id) ?? [];
      byOrder.delete(o.id);
      if (!items.length && !v.length) continue;
      (items.length ? list : ghosts).push({ order: o, items, voided: v, readyCount: o.items.length - items.length });
    }
    for (const v of byOrder.values()) ghosts.push({ order: v[0].order, items: [], voided: v, readyCount: 0 });
    // Faqat bekor qilinganlardan iborat kartochkalar — birinchi (oshpaz ko'rishi shart)
    return [...ghosts, ...list];
  }, [orders, voided]);

  const ready = useMemo(() => readyGroups(orders, now, KDS_READY_WINDOW_MIN), [orders, now]);
  const counts = useMemo(() => kdsCounts(orders), [orders]);
  const freshOrders = useMemo(() => new Set(Object.entries(fresh.orders).filter(([, u]) => u > now).map(([id]) => id)), [fresh, now]);
  const freshItems = useMemo(() => new Set(Object.entries(fresh.items).filter(([, u]) => u > now).map(([id]) => id)), [fresh, now]);

  const liveText = phase === 'live' ? k.live : phase === 'offline' ? k.offline : phase === 'loading' ? k.loading : '';
  const fatal = phase === 'auth' || phase === 'denied' || (phase === 'error' && !orders.length);

  return (
    <div className={`kds kds--${prefs.size}${kiosk ? ' kds--kiosk' : ''}`}>
      <div className="sr-only" aria-live="polite" aria-atomic="true">{announce}</div>

      <header className="kds-head">
        <div className="kds-head-main">
          <h1 className="kds-title">{k.title}</h1>
          {liveText && <span className={`kds-live kds-live--${phase}`} role="status">{liveText}</span>}
          {now > 0 && <span className="kds-clock tnum" aria-hidden={!kiosk}>{clockHHMM(now)}</span>}
        </div>
        <div className="kds-counts" aria-label={k.ordersCol}>
          <span className="kds-count" data-k="waiting"><b className="tnum">{counts.waiting}</b>{k.waiting}</span>
          <span className="kds-count" data-k="cooking"><b className="tnum">{counts.cooking}</b>{k.cooking}</span>
          <span className="kds-count" data-k="ready"><b className="tnum">{counts.ready}</b>{k.readyCol}</span>
        </div>
        <div className="kds-tools" role="toolbar" aria-label={k.title}>
          <button
            type="button"
            className="kds-tool"
            aria-pressed={prefs.sound}
            aria-label={k.soundToggle}
            title={prefs.sound ? k.soundOn : k.soundOff}
            onClick={toggleSound}
          >
            <SoundIcon on={prefs.sound} />
            <span className="kds-tool-text">{prefs.sound ? k.soundOn : k.soundOff}</span>
          </button>
          <button
            type="button"
            className="kds-tool"
            aria-pressed={prefs.showReady}
            onClick={() => setPrefs((p) => ({ ...p, showReady: !p.showReady }))}
          >
            <Icon name={prefs.showReady ? 'eyeOff' : 'eye'} size={20} />
            <span className="kds-tool-text">{prefs.showReady ? k.hideDone : k.showDone}</span>
          </button>
          <button
            type="button"
            className="kds-tool"
            aria-label={`${k.textSize}: ${k.textSizes[prefs.size]}`}
            onClick={() => setPrefs((p) => ({ ...p, size: SIZES[(SIZES.indexOf(p.size) + 1) % SIZES.length] }))}
          >
            <span className="kds-tool-aa" aria-hidden="true">A<small>A</small></span>
            <span className="kds-tool-text">{k.textSizes[prefs.size]}</span>
          </button>
          <button
            type="button"
            className="kds-tool"
            aria-pressed={kiosk}
            onClick={() => { unlock(false); toggleKiosk(); }}
          >
            <ExpandIcon out={kiosk} />
            <span className="kds-tool-text">{kiosk ? k.exitFullscreen : k.fullscreen}</span>
          </button>
          {!kiosk && (
            <Link className="kds-tool" href="/app/kitchen/print">
              <Icon name="clipboard" size={20} />
              <span className="kds-tool-text">{d.restaurant.print.title}</span>
            </Link>
          )}
        </div>
      </header>

      {!kiosk && (
        <p className="kds-sub">
          {k.sub} {tr(k.thresholds, { warn: th.warnMin, alert: th.alertMin })}.
          {wake.active && <span className="kds-wake"> · {k.wakeOn}</span>}
        </p>
      )}

      {(stations.length > 0 || (isAdmin && branches.length > 1)) && (
        <div className="kds-filters">
          {isAdmin && branches.length > 1 && (
            <label className="kds-branch">
              <span>{k.branch}</span>
              <select
                value={branchId}
                onChange={(e) => { setStation(''); setBranchId(e.target.value); }}
              >
                <option value="">—</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
          )}
          {stations.length > 0 && (
            <div className="kds-stations" role="group" aria-label={k.stationFilter}>
              <button type="button" className="kds-station" aria-pressed={!station} onClick={() => setStation('')}>
                {k.all}
              </button>
              {stations.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="kds-station"
                  data-kind={s.kind}
                  aria-pressed={station === s.id}
                  onClick={() => setStation(s.id)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {prefs.sound && locked && !fatal && (
        <div className="kds-banner" role="note">
          <SoundIcon on={false} />
          <span>{k.soundLocked}</span>
          <button type="button" className="kds-btn kds-btn--tinted" onClick={() => unlock(true)}>{k.soundEnable}</button>
        </div>
      )}
      {!canBump && !fatal && <p className="kds-ro">{k.readOnly}</p>}

      {fatal ? (
        <div className="kds-state" role="alert">
          <span className="kds-state-ic"><Icon name={phase === 'auth' ? 'lock' : 'alert'} size={28} /></span>
          <b>{phase === 'auth' ? k.authRequired : phase === 'denied' ? (phaseMsg || k.loadError) : k.loadError}</b>
          {phase === 'auth'
            ? <Link href="/login" className="kds-btn kds-btn--primary">{k.login}</Link>
            : <button type="button" className="kds-btn kds-btn--primary" onClick={() => setReloadKey((n) => n + 1)}>{k.retry}</button>}
        </div>
      ) : phase === 'loading' && !orders.length ? (
        <div className="kds-state" aria-busy="true"><span className="kds-spinner" aria-hidden="true" />{k.loading}</div>
      ) : (
        <div className={`kds-body${prefs.showReady ? '' : ' kds-body--solo'}`}>
          <section className="kds-main" aria-labelledby="kds-orders-h">
            <h2 id="kds-orders-h" className="sr-only">{k.ordersCol}</h2>
            {cards.length ? (
              <div className="kds-grid">
                {cards.map((c) => (
                  <KdsCard
                    key={c.order.id}
                    order={c.order}
                    items={c.items}
                    voided={c.voided}
                    reduced={reduced}
                    readyCount={prefs.showReady ? 0 : c.readyCount}
                    now={now}
                    th={th}
                    stationName={stationName}
                    isNew={freshOrders.has(c.order.id)}
                    newItems={freshItems}
                    busy={busy}
                    canBump={canBump}
                    onBump={onBump}
                    onAck={onAck}
                  />
                ))}
              </div>
            ) : (
              <div className="kds-empty">
                <span className="kds-state-ic"><Icon name="utensils" size={28} /></span>
                <b>{stations.length === 0 ? k.empty : station ? k.emptyStation : k.empty}</b>
                <p>{stations.length === 0 ? k.noStations : k.emptyHint}</p>
              </div>
            )}
          </section>

          {prefs.showReady && (
            <aside className="kds-ready" aria-labelledby="kds-ready-h">
              <h2 id="kds-ready-h" className="kds-ready-title">
                {k.readyCol} <span className="kds-ready-n tnum">{counts.ready}</span>
              </h2>
              <p className="kds-ready-hint">{k.readyHint}</p>
              {ready.recent.length === 0 && <p className="kds-ready-empty">{k.readyEmpty}</p>}
              <div className="kds-ready-list">
                {[...ready.recent, ...(showOlder ? ready.older : [])].map((g) => (
                  <KdsReadyCard
                    key={g.order.id}
                    order={g.order}
                    items={g.items}
                    firstReadyMs={g.firstReadyMs}
                    now={now}
                    busy={busy}
                    canBump={canBump}
                    confirming={confirmServe === g.order.id}
                    onServe={onServe}
                    onRecall={onRecall}
                  />
                ))}
              </div>
              {ready.older.length > 0 && (
                <button type="button" className="kds-older" aria-expanded={showOlder} onClick={() => setShowOlder((v) => !v)}>
                  {tr(k.olderReady, { n: ready.older.length, min: KDS_READY_WINDOW_MIN })} — {showOlder ? k.hideOlder : k.showOlder}
                </button>
              )}
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
