/**
 * Bron vaqti — SOF funksiyalar (importsiz, `node --test` bilan tekshiriladi). Server bilan bir xil qoida
 * (web/lib/restaurant/reservationRules.ts): kun va soat Toshkent vaqtida (UTC+5, telefon vaqt zonasidan mustaqil),
 * vaqt 15 daqiqa qadam bilan, davomiylik 30–480 daqiqa.
 */

export const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

export const DURATION_PRESETS = [60, 90, 120, 180, 240] as const;
export const GUEST_PRESETS = [1, 2, 3, 4, 5, 6, 8, 10] as const;
export const MINUTE_STEPS = [0, 15, 30, 45] as const;
export const DEFAULT_DURATION = 120;
export const MAX_ITEMS = 30;

const pad = (n: number) => String(n).padStart(2, '0');

/** Lahza → Toshkent kuni YYYY-MM-DD */
export function tashkentDay(d: Date = new Date()): string {
  return new Date(d.getTime() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
}

/** Lahza → Toshkent soati daqiqada (0–1439) */
export function tashkentMinutes(d: Date = new Date()): number {
  const t = new Date(d.getTime() + TASHKENT_OFFSET_MS);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}

/** YYYY-MM-DD + n kun */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Daqiqa → «HH:MM» */
export function fmtTime(minutes: number): string {
  const v = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(v / 60))}:${pad(v % 60)}`;
}

/** «HH:MM» → daqiqa (15 daqiqa qadam); noto'g'ri — null */
export function parseTime(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59 || min % 15 !== 0) return null;
  return h * 60 + min;
}

/** Yangi bron uchun boshlang'ich vaqt: bugun — keyingi choraqdan 30 daqiqa keyin, boshqa kun — 19:00 */
export function defaultMinutes(day: string, now: Date = new Date()): number {
  if (day !== tashkentDay(now)) return 19 * 60;
  return Math.min(23 * 60 + 45, Math.ceil(tashkentMinutes(now) / 15) * 15 + 30);
}

/** «DD.MM» ko'rinishi (kun kaliti bo'yicha) */
export function fmtDayShort(day: string): string {
  const [, m, d] = day.split('-');
  return `${d}.${m}`;
}

/** Hafta kuni (0 — yakshanba) kun kaliti bo'yicha */
export function weekday(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Ro'yxatni soat bo'yicha guruhlash: «18:00» → bronlar */
export function groupByHour<T extends { time: string }>(list: readonly T[]): { hour: string; items: T[] }[] {
  const out: { hour: string; items: T[] }[] = [];
  for (const r of list) {
    const hour = `${r.time.slice(0, 2)}:00`;
    const last = out[out.length - 1];
    if (last && last.hour === hour) last.items.push(r);
    else out.push({ hour, items: [r] });
  }
  return out;
}

/** «Keldi» — boshlanishiga ko'pi bilan shuncha daqiqa qolganda (server: reservationTooEarly) */
export const SEAT_EARLY_MIN = 180;

/** «Keldi» tugmasi ko'rinadimi */
export const canSeatNow = (startAtIso: string, nowMs: number = Date.now()): boolean =>
  new Date(startAtIso).getTime() - nowMs <= SEAT_EARLY_MIN * 60_000;

/** Boshlanish vaqti keldimi («Kelmadi» tugmasi) */
export const hasStarted = (startAtIso: string, nowMs: number = Date.now()): boolean => nowMs >= new Date(startAtIso).getTime();
