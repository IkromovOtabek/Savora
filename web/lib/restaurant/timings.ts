/**
 * Taom vaqt o'lchovlari (sof funksiyalar): «taom necha daqiqada stolga keldi».
 *   navbat        = cookStartedAt − sentAt   (oshpaz qachon boshladi)
 *   tayyorlanish  = readyAt − sentAt
 *   yetkazish     = servedAt − readyAt
 *   umumiy        = servedAt − sentAt
 * Belgisi yo'q yoki manfiy (soat noto'g'ri) bo'lsa — null.
 */
export interface TimedItem {
  sentAt?: Date | string | null;
  cookStartedAt?: Date | string | null;
  readyAt?: Date | string | null;
  servedAt?: Date | string | null;
}

export interface ItemTimings {
  waitMs: number | null;
  prepMs: number | null;
  deliveryMs: number | null;
  totalMs: number | null;
}

const ms = (v: Date | string | null | undefined): number | null => {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

function diff(to: Date | string | null | undefined, from: Date | string | null | undefined): number | null {
  const a = ms(to);
  const b = ms(from);
  if (a === null || b === null || a < b) return null;
  return a - b;
}

export function itemTimings(i: TimedItem): ItemTimings {
  return {
    waitMs: diff(i.cookStartedAt, i.sentAt),
    prepMs: diff(i.readyAt, i.sentAt),
    deliveryMs: diff(i.servedAt, i.readyAt),
    totalMs: diff(i.servedAt, i.sentAt),
  };
}

export interface DurationStats {
  count: number;
  avgMs: number | null;
  medianMs: number | null;
  p90Ms: number | null;
  maxMs: number | null;
}

/** Davomiyliklar statistikasi (null'lar tashlanadi) */
export function durationStats(values: (number | null | undefined)[]): DurationStats {
  const list = values.filter((v): v is number => typeof v === 'number' && v >= 0).sort((a, b) => a - b);
  if (!list.length) return { count: 0, avgMs: null, medianMs: null, p90Ms: null, maxMs: null };
  const at = (q: number) => list[Math.min(list.length - 1, Math.ceil(q * list.length) - 1)];
  const mid = Math.floor(list.length / 2);
  const median = list.length % 2 ? list[mid] : Math.round((list[mid - 1] + list[mid]) / 2);
  return {
    count: list.length,
    avgMs: Math.round(list.reduce((s, v) => s + v, 0) / list.length),
    medianMs: median,
    p90Ms: at(0.9),
    maxMs: list[list.length - 1],
  };
}

export function summarizeTimings(items: TimedItem[]): { prep: DurationStats; delivery: DurationStats; wait: DurationStats; total: DurationStats } {
  const t = items.map(itemTimings);
  return {
    prep: durationStats(t.map((x) => x.prepMs)),
    delivery: durationStats(t.map((x) => x.deliveryMs)),
    wait: durationStats(t.map((x) => x.waitMs)),
    total: durationStats(t.map((x) => x.totalMs)),
  };
}

export type KdsLevel = 'ok' | 'warn' | 'alert';

/** Oshxona ekranidagi rang: yuborilganidan beri o'tgan daqiqa sozlamadagi chegaralar bilan */
export function kdsLevel(sentAt: Date | string | null | undefined, now: Date, s: { kdsWarnMinutes: number; kdsAlertMinutes: number }): KdsLevel {
  const sent = ms(sentAt);
  if (sent === null) return 'ok';
  const minutes = (now.getTime() - sent) / 60_000;
  if (minutes >= s.kdsAlertMinutes) return 'alert';
  if (minutes >= s.kdsWarnMinutes) return 'warn';
  return 'ok';
}
