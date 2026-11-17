/**
 * Oshxona ekrani (KDS) — sof funksiyalar: taymer va rang chegaralari, polling javoblarini birlashtirish,
 * «Tayyor» ustuni guruhlari. React/DOM importi yo'q — tests/kitchenKds.test.ts da tekshiriladi.
 * Ma'lumot shakli: GET /api/restaurant/kitchen (docs/RESTORAN_API.md §7).
 */
import type { KdsItem, KdsOrder } from '@/lib/restaurant/queries';
import type { OrderView } from '@/lib/restaurant/view';
import type { KdsLevel } from '@/lib/restaurant/timings';
import type { ItemStatus } from '@/lib/restaurant/types';

/* ───────────────────────────── konstantalar ───────────────────────────── */

/** Sariq (ogohlantirish) — yuborilganidan shuncha daqiqa o'tgach; sozlamada (kdsWarnMinutes) bo'lmasa */
export const KDS_WARN_MIN = 10;
/** Qizil (kechikish) — shuncha daqiqadan keyin; sozlamada (kdsAlertMinutes) bo'lmasa */
export const KDS_ALERT_MIN = 20;
/** Polling oralig'i (API tavsiyasi: 3 s; 4 s — planshet/TV uchun yengilroq) */
export const KDS_POLL_MS = 4_000;
/** Xatoda kutish chegarasi (eksponensial orqaga chekinish) */
export const KDS_POLL_MAX_MS = 15_000;
/** Shu oraliqda bir marta to'liq (since'siz) so'rov — tushib qolgan o'zgarishlarni tiklash */
export const KDS_FULL_SYNC_MS = 120_000;
/** Sahifa shuncha vaqt yashirin bo'lsa — qaytganda to'liq so'rov */
export const KDS_HIDDEN_RESET_MS = 5 * 60_000;
/** Yangi kartochka/taomni ajratib ko'rsatish davomiyligi */
export const KDS_NEW_HIGHLIGHT_MS = 12_000;
/** «Tayyor» ustuni: oxirgi shuncha daqiqada tayyor bo'lganlar */
export const KDS_READY_WINDOW_MIN = 30;
/** Bekor qilingan / kamaygan taom ogohlantirishi — «Tushunarli» bosilmasa, shuncha vaqtdan keyin yo'qoladi */
export const KDS_VOID_TTL_MS = 10 * 60_000;

/** Oshxonada ishlanayotgan holatlar (asosiy ustun) */
export const KDS_ACTIVE: readonly ItemStatus[] = ['sent', 'cooking'];
const KDS_VISIBLE: readonly ItemStatus[] = ['sent', 'cooking', 'ready'];

/* ───────────────────────────── vaqt va chegara ───────────────────────────── */

export interface KdsThresholds {
  warnMin: number;
  alertMin: number;
}

const posNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** Sozlamadagi chegaralar (kdsWarnMinutes/kdsAlertMinutes); yaroqsiz bo'lsa — konstantalar. Qizil har doim sariqdan keyin */
export function kdsThresholds(s?: { kdsWarnMinutes?: number | null; kdsAlertMinutes?: number | null } | null): KdsThresholds {
  const warnMin = posNum(s?.kdsWarnMinutes) ? s.kdsWarnMinutes : KDS_WARN_MIN;
  let alertMin = posNum(s?.kdsAlertMinutes) ? s.kdsAlertMinutes : KDS_ALERT_MIN;
  if (alertMin <= warnMin) alertMin = warnMin + (KDS_ALERT_MIN - KDS_WARN_MIN);
  return { warnMin, alertMin };
}

/** ISO satr → ms (yaroqsiz/bo'sh — null) */
export function toMs(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/** Yuborilganidan beri o'tgan vaqt (ms, ≥ 0); belgi yo'q bo'lsa — 0 */
export function elapsedMs(sentAt: string | null | undefined, nowMs: number): number {
  const t = toMs(sentAt);
  return t === null ? 0 : Math.max(0, nowMs - t);
}

/** Rang darajasi: ok → warn (sariq) → alert (qizil) */
export function timerLevel(elapsed: number, th: KdsThresholds): KdsLevel {
  const min = elapsed / 60_000;
  if (min >= th.alertMin) return 'alert';
  if (min >= th.warnMin) return 'warn';
  return 'ok';
}

/** Butun daqiqalar (pastga yaxlitlanadi) */
export function elapsedMinutes(ms: number): number {
  return Math.max(0, Math.floor(ms / 60_000));
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Taymer: «m:ss», soatdan oshsa «h:mm:ss» */
export function formatTimer(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

/** Mahalliy vaqt «HH:MM» */
export function clockHHMM(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/* ───────────────────────────── kartochka ───────────────────────────── */

export const isActiveItem = (i: Pick<KdsItem, 'status'>) => KDS_ACTIVE.includes(i.status);

export interface CardTimer {
  /** Eng eski faol taom yuborilgan vaqt (ms) */
  startMs: number | null;
  elapsed: number;
  level: KdsLevel;
}

/** Kartochka taymeri — eng eski faol (sent/cooking) taom bo'yicha; faol taom yo'q bo'lsa — 0, ok */
export function cardTimer(items: readonly KdsItem[], nowMs: number, th: KdsThresholds): CardTimer {
  let startMs: number | null = null;
  for (const i of items) {
    if (!isActiveItem(i)) continue;
    const t = toMs(i.sentAt);
    if (t !== null && (startMs === null || t < startMs)) startMs = t;
  }
  const elapsed = startMs === null ? 0 : Math.max(0, nowMs - startMs);
  return { startMs, elapsed, level: startMs === null ? 'ok' : timerLevel(elapsed, th) };
}

/** Taom bo'yicha keyingi oshxona amali: sent → «Boshlash», cooking → «Tayyor» */
export function nextBump(status: ItemStatus): 'cooking' | 'ready' | null {
  if (status === 'sent') return 'cooking';
  if (status === 'cooking') return 'ready';
  return null;
}

/** «B20261118-0012» → «0012» (ekranda qisqa raqam) */
export function shortOrderNo(orderNo: string): string {
  const i = orderNo.lastIndexOf('-');
  return i >= 0 && i < orderNo.length - 1 ? orderNo.slice(i + 1) : orderNo;
}

/** Eng eski yuborilgan taom bo'yicha tartib (birinchi kelgan — birinchi) */
function orderStart(o: KdsOrder): number {
  let min = Number.POSITIVE_INFINITY;
  for (const i of o.items) {
    const t = toMs(i.sentAt);
    if (t !== null && t < min) min = t;
  }
  return min;
}

export function sortOrders(list: readonly KdsOrder[]): KdsOrder[] {
  return [...list].sort((a, b) => orderStart(a) - orderStart(b) || a.orderNo.localeCompare(b.orderNo));
}

/* ───────────────────────────── polling birlashtirish ───────────────────────────── */

export interface KdsMerge {
  orders: KdsOrder[];
  /** Avval ko'rilmagan faol taomlar (ovozli signal va ajratish uchun); newOrder — kartochka yangi */
  added: { orderId: string; itemIds: string[]; newOrder: boolean }[];
  /** Ekrandan yo'qolgan taomlar — berildi yoki bekor qilindi (taqdiri alohida aniqlanadi) */
  vanished: { order: KdsOrder; item: KdsItem }[];
  /** Miqdori kamaygan taomlar (qisman bekor qilish — qator ikkiga bo'linadi, asl qator kamayadi) */
  reduced: { orderId: string; itemId: string; from: number; to: number }[];
}

/** Kelgan javob eskirganmi (bump javobidan keyin kechikib kelgan polling) */
function isStale(incoming: KdsOrder, local: KdsOrder | undefined): boolean {
  if (!local) return false;
  const a = toMs(incoming.updatedAt);
  const b = toMs(local.updatedAt);
  return a !== null && b !== null && a < b;
}

/**
 * Javobni ekrandagi holatga qo'shish:
 *   full  — javob to'liq ro'yxat (yo'q buyurtma — olib tashlanadi);
 *   since — faqat o'zgarganlar: id bo'yicha almashtiriladi, `items: []` — kartochka olib tashlanadi.
 * Eskirgan (updatedAt kichik) javob mahalliy yangiroq holatni bosib ketmaydi.
 * `seen` — sessiyada ko'rilgan taom id'lari (yangi taomni aniqlash uchun; chaqiruvchi yangilaydi).
 */
export function mergeBoard(
  prev: readonly KdsOrder[],
  incoming: readonly KdsOrder[],
  mode: 'full' | 'since',
  seen: ReadonlySet<string>,
): KdsMerge {
  const prevById = new Map(prev.map((o) => [o.id, o]));
  const next = new Map<string, KdsOrder>(mode === 'since' ? prevById : []);

  for (const inc of incoming) {
    const local = prevById.get(inc.id);
    if (isStale(inc, local)) {
      if (local) next.set(local.id, local);
      continue;
    }
    if (!inc.items.length) next.delete(inc.id);
    else next.set(inc.id, inc);
  }

  const vanished: KdsMerge['vanished'] = [];
  const reduced: KdsMerge['reduced'] = [];
  for (const old of prev) {
    const now = next.get(old.id);
    const byId = new Map((now?.items ?? []).map((i) => [i.id, i]));
    for (const item of old.items) {
      const cur = byId.get(item.id);
      if (!cur) vanished.push({ order: old, item });
      else if (cur.qty < item.qty) reduced.push({ orderId: old.id, itemId: item.id, from: item.qty, to: cur.qty });
    }
  }

  const orders = sortOrders([...next.values()]);
  const added: KdsMerge['added'] = [];
  for (const o of orders) {
    const ids = o.items.filter((i) => !seen.has(i.id) && isActiveItem(i)).map((i) => i.id);
    if (ids.length) added.push({ orderId: o.id, itemIds: ids, newOrder: !prevById.has(o.id) });
  }
  return { orders, added, vanished, reduced };
}

/* ───────────────────────────── bump javobi (OrderView → KdsOrder) ───────────────────────────── */

/**
 * `bumpItemsAction` qaytargan to'liq buyurtmani KDS kartochkasiga aylantirish (joriy stansiya filtri bilan).
 * `voided` — bekor qilingan taomlar (sabab bilan): ekrandan yo'qolganlarining taqdirini aniqlash uchun.
 */
export function kdsOrderFromView(
  v: OrderView,
  stationId: string | null,
  nowMs: number,
  th: KdsThresholds,
): { order: KdsOrder; voided: Map<string, string | null> } {
  const inStation = (sid: string | null) => !stationId || sid === stationId;
  const items: KdsItem[] = v.status === 'cancelled' ? [] : v.items
    .filter((i) => KDS_VISIBLE.includes(i.status) && inStation(i.stationId))
    .map((i) => {
      const elapsed = elapsedMs(i.sentAt, nowMs);
      return {
        id: i.id,
        name: i.name,
        displayName: i.displayName,
        qty: i.qty,
        unit: i.unit,
        modifiers: i.modifiers.map((m) => ({ group: m.group, name: m.name })),
        note: i.note,
        status: i.status,
        stationId: i.stationId,
        stationKind: i.stationKind,
        fromQr: i.fromQr,
        sentAt: i.sentAt,
        cookStartedAt: i.cookStartedAt,
        readyAt: i.readyAt,
        elapsedMs: elapsed,
        level: i.status === 'ready' ? 'ok' : timerLevel(elapsed, th),
      };
    });
  const voided = new Map<string, string | null>();
  for (const i of v.items) if (i.status === 'voided') voided.set(i.id, i.voidReason);
  return {
    order: {
      id: v.id,
      orderNo: v.orderNo,
      type: v.type,
      status: v.status,
      source: v.source,
      tableNumber: v.tableNumber,
      waiterName: v.waiterName,
      guests: v.guests,
      note: v.note,
      updatedAt: v.updatedAt,
      items,
      voided: v.items
        .filter((i) => i.status === 'voided' && i.voidStage !== 'unsent' && inStation(i.stationId))
        .map((i) => ({ id: i.id, reason: i.voidReason, voidedAt: i.voidedAt })),
    },
    voided,
  };
}

/** API javobidagi bekor qilingan taomlar (id → sabab): ekrandan yo'qolgan taom bekor qilinganmi — shundan */
export function voidedMapOf(orders: readonly Pick<KdsOrder, 'voided'>[]): Map<string, string | null> {
  const m = new Map<string, string | null>();
  for (const o of orders) for (const v of o.voided ?? []) m.set(v.id, v.reason);
  return m;
}

/* ───────────────────────────── «Tayyor» ustuni ───────────────────────────── */

export interface ReadyGroup {
  order: KdsOrder;
  items: KdsItem[];
  /** Eng eski tayyor bo'lgan vaqt (ms) — kutayotgan vaqt shundan */
  firstReadyMs: number | null;
  /** Eng oxirgi tayyor bo'lgan vaqt (ms) — oyna (oxirgi N daqiqa) shundan */
  lastReadyMs: number | null;
}

/**
 * Tayyor taomlar buyurtma bo'yicha: oxirgi `windowMin` daqiqada tayyor bo'lganlar — `recent`
 * (eng uzoq kutayotgani birinchi), qolganlari — `older`.
 */
export function readyGroups(orders: readonly KdsOrder[], nowMs: number, windowMin: number): { recent: ReadyGroup[]; older: ReadyGroup[] } {
  const recent: ReadyGroup[] = [];
  const older: ReadyGroup[] = [];
  const edge = nowMs - windowMin * 60_000;
  for (const order of orders) {
    const items = order.items.filter((i) => i.status === 'ready');
    if (!items.length) continue;
    let first: number | null = null;
    let last: number | null = null;
    for (const i of items) {
      const t = toMs(i.readyAt);
      if (t === null) continue;
      if (first === null || t < first) first = t;
      if (last === null || t > last) last = t;
    }
    const g: ReadyGroup = { order, items, firstReadyMs: first, lastReadyMs: last };
    (last === null || last >= edge ? recent : older).push(g);
  }
  const byFirst = (a: ReadyGroup, b: ReadyGroup) => (a.firstReadyMs ?? nowMs) - (b.firstReadyMs ?? nowMs);
  return { recent: recent.sort(byFirst), older: older.sort(byFirst) };
}

/* ───────────────────────────── ekran hisoblagichlari ───────────────────────────── */

export function kdsCounts(orders: readonly KdsOrder[]): { waiting: number; cooking: number; ready: number } {
  const c = { waiting: 0, cooking: 0, ready: 0 };
  for (const o of orders) {
    for (const i of o.items) {
      if (i.status === 'sent') c.waiting++;
      else if (i.status === 'cooking') c.cooking++;
      else if (i.status === 'ready') c.ready++;
    }
  }
  return c;
}
