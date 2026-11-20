/**
 * Bildirishnomalar — sof yordamchilar (DB importi yo'q; server, web client va testlarda ishlaydi):
 * turlar ro'yxati, takrorlanmaslik oynalari, ohang/ikonka, matn (lug'atdan, ko'ruvchi tilida), xavfsiz url,
 * «5 daqiqa oldin». Saqlash, push va kim ko'rishi — lib/notify.ts.
 */
import type { NotifyKind, NotifyParams } from './notify';
import type { Dict } from './i18n/dict';
import { tr } from './i18n/fmt';
import { fmtQty } from './qty';

/** Barcha turlar (Notification.kind enum) — `NotifyKind` bilan bir xil bo'lishi shart (pastdagi tekshiruv) */
export const NOTIFY_KINDS = ['lowStock', 'dishLow', 'waiterCall', 'billCall', 'reservationSoon'] as const;
type MissingKind = Exclude<NotifyKind, (typeof NOTIFY_KINDS)[number]>;
// Yangi tur `NotifyKind` ga qo'shilsa-yu bu yerda bo'lmasa — kompilyatsiya xatosi
const kindsComplete: [MissingKind] extends [never] ? true : never = true;
void kindsComplete;

export function isNotifyKind(v: unknown): v is NotifyKind {
  return typeof v === 'string' && (NOTIFY_KINDS as readonly string[]).includes(v);
}

const MIN = 60_000;
const HOUR = 60 * MIN;

/**
 * Takrorlanmaslik oynasi (`dedupeKey` bilan): shu muddatda shu kalitli (hal qilinmagan) xabar bo'lsa — yangisi yaratilmaydi.
 * Chaqiruvlar — 2 daqiqa (mijoz qayta-qayta bossa ham bitta xabar; «Ko'rdim» bosilgach — darhol yangisi mumkin),
 * ombor — 12 soat (bir smenada bir marta eslatadi), bron — 1 soat.
 */
export const NOTIFY_DEDUPE_MS: Record<NotifyKind, number> = {
  waiterCall: 2 * MIN,
  billCall: 2 * MIN,
  lowStock: 12 * HOUR,
  dishLow: 12 * HOUR,
  reservationSoon: HOUR,
};

/** Saqlash muddati (TTL indeks) */
export const NOTIFY_TTL_DAYS = 14;

/** Ohang: `call` — shoshilinch (mijoz kutyapti: toast + baland signal), `stock` — ombor/menyu, `info` — boshqa */
export type NotifyTone = 'call' | 'stock' | 'info';

const TONES: Record<NotifyKind, NotifyTone> = {
  waiterCall: 'call',
  billCall: 'call',
  lowStock: 'stock',
  dishLow: 'stock',
  reservationSoon: 'info',
};

export function notifyTone(kind: string): NotifyTone {
  return isNotifyKind(kind) ? TONES[kind] : 'info';
}

/** Ro'yxatda va qo'ng'iroqchada ko'rsatiladigan ko'rinish (API javobi) */
export interface NotificationView {
  id: string;
  kind: NotifyKind;
  params: NotifyParams;
  /** Web yo'li ('/app/...'); mobil o'z ekraniga moslaydi */
  url: string | null;
  createdAt: string;
  /** Shu foydalanuvchi o'qigan yoki chaqiruv «Ko'rdim» bilan hal qilingan */
  read: boolean;
  /** Chaqiruv stollar taxtasida «Ko'rdim» bilan yopilgan */
  handled: boolean;
  /** Ko'ruvchi tilida tayyor matn */
  title: string;
  body: string;
}

export interface NotificationList {
  serverTime: string;
  unread: number;
  items: NotificationView[];
}

/** Parametrlarni tozalash: faqat oddiy qiymatlar, kalit va matn uzunligi cheklangan (bazaga yoziladi) */
export function cleanParams(p: unknown): NotifyParams {
  const out: NotifyParams = {};
  if (!p || typeof p !== 'object') return out;
  let n = 0;
  for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
    if (n >= 12 || !/^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(k)) continue;
    if (typeof v === 'string') out[k] = v.trim().slice(0, 120);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (v === null) out[k] = null;
    else continue;
    n++;
  }
  return out;
}

/** Faqat ilova ichidagi yo'l ('/app/...') — tashqi manzilga (//evil.com, javascript:) o'tkazib yubormaslik uchun */
export function safeAppUrl(url: unknown): string | null {
  if (typeof url !== 'string' || url.length > 200) return null;
  return /^\/app(\/[A-Za-z0-9_\-/]*)?(\?[A-Za-z0-9_\-=&%.]*)?$/.test(url) && !url.includes('//') ? url : null;
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v));

/** Miqdor + birlik: 0,4 kg / 3 dona (birlik nomi — lug'atdan) */
function qtyText(d: Dict, qty: unknown, unit: unknown): string {
  const n = num(qty);
  const q = Number.isFinite(n) ? fmtQty(n) : str(qty);
  const units = d.stock.fields.units as Record<string, string>;
  const u = typeof unit === 'string' && unit ? ` ${units[unit] ?? unit}` : '';
  return `${q}${u}`;
}

/** Sarlavha va matn — ko'ruvchi tilida (lug'at `d.notify.kinds`). Noma'lum tur — umumiy sarlavha */
export function notifyText(d: Dict, kind: string, params: NotifyParams): { title: string; body: string } {
  const t = d.notify.kinds;
  const p = params ?? {};
  const branch = p.branch ? tr(d.notify.branchSuffix, { branch: str(p.branch) }) : '';
  switch (kind) {
    case 'waiterCall':
      return { title: t.waiterCall.title, body: tr(t.waiterCall.body, { table: str(p.table) }) };
    case 'billCall':
      return { title: t.billCall.title, body: tr(t.billCall.body, { table: str(p.table) }) };
    case 'lowStock':
      return {
        title: tr(t.lowStock.title, { product: str(p.product) }),
        body: tr(t.lowStock.body, { qty: qtyText(d, p.qty, p.unit), min: qtyText(d, p.min, p.unit) }) + branch,
      };
    case 'dishLow': {
      const portions = num(p.portions);
      // `goods` — tayyor tovar (ichimlik, non): porsiya emas, ombordagi qoldiq
      const goods = num(p.goods) === 1;
      if (!(portions > 0)) return { title: tr(t.dishOut.title, { dish: str(p.dish) }), body: (goods ? t.dishOut.goodsBody : t.dishOut.body) + branch };
      const body = goods ? tr(t.dishLow.goodsBody, { qty: qtyText(d, portions, p.unit) }) : tr(t.dishLow.body, { portions });
      return { title: tr(t.dishLow.title, { dish: str(p.dish) }), body: body + branch };
    }
    case 'reservationSoon': {
      const who = { name: str(p.name), guests: str(p.guests) };
      const body = p.table !== null && p.table !== undefined && p.table !== ''
        ? tr(t.reservationSoon.body, { ...who, table: str(p.table) })
        : tr(t.reservationSoon.bodyNoTable, who);
      return { title: tr(t.reservationSoon.title, { time: str(p.time) }), body };
    }
    default:
      return { title: d.notify.bell.title, body: '' };
  }
}

/** «Hozirgina» / «5 daqiqa oldin» / «2 soat oldin» / «3 kun oldin» */
export function notifyAgo(d: Dict, iso: string, now = Date.now()): string {
  const ms = Math.max(0, now - new Date(iso).getTime());
  const a = d.notify.ago;
  if (!Number.isFinite(ms) || ms < MIN) return a.now;
  if (ms < HOUR) return tr(a.minutes, { n: Math.floor(ms / MIN) });
  if (ms < 24 * HOUR) return tr(a.hours, { n: Math.floor(ms / HOUR) });
  return tr(a.days, { n: Math.floor(ms / (24 * HOUR)) });
}
