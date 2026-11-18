/**
 * Ishbay sahifalari (ro'yxat, jamlama, chop etish) uchun davr: URL'dagi `?m=YYYY-MM` (sukut — joriy oy) yoki
 * `?from=YYYY-MM-DD&to=YYYY-MM-DD` oraliq. Sof funksiyalar (server sahifalari va testlar uchun).
 *
 * Kunlar — Toshkent vaqti (UTC+5, lib/period.ts): `from` — birinchi kun boshi, `to` — oxirgi kun BOSHI (Toshkent
 * yarim tuni); backend (lib/production/common.ts → dateRange) yarim tunni «shu kun oxirigacha» deb oladi.
 */
import { isDayPeriod, tashkentDayKey, tashkentDayStart, tashkentMonthBounds } from '@/lib/period';
import { PRODUCTION_LIMITS } from '@/lib/production/calc';

export interface PwRange {
  /** Oy rejimi: YYYY-MM; oraliqda — boshlanish oyi */
  month: string;
  /** Joriy oy (MonthNav uchun) */
  currentMonth: string;
  isRange: boolean;
  fromDay: string;
  toDay: string;
  /** Birinchi kun boshi (Toshkent 00:00) */
  from: Date;
  /** Oxirgi kun boshi (Toshkent 00:00) — server shu kun oxirigacha oladi */
  to: Date;
  /** Oraliq chegaradan uzun edi — qisqartirildi */
  clamped: boolean;
}

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY_MS = 86_400_000;

export function parsePwRange(sp: { m?: string; from?: string; to?: string }, now = new Date()): PwRange {
  const currentMonth = tashkentDayKey(now).slice(0, 7);
  const maxDays = PRODUCTION_LIMITS.maxPeriodDays;
  if (isDayPeriod(sp.from) && isDayPeriod(sp.to) && sp.from <= sp.to) {
    const from = tashkentDayStart(sp.from);
    let to = tashkentDayStart(sp.to);
    let clamped = false;
    // Server ham ≤ 366 kun qiladi (pieceworkSummary) — bu yerda oldindan, ko'rsatiladigan sana to'g'ri bo'lsin
    const limit = new Date(from.getTime() + (maxDays - 1) * DAY_MS);
    if (to > limit) { to = limit; clamped = true; }
    return { month: sp.from.slice(0, 7), currentMonth, isRange: true, fromDay: sp.from, toDay: tashkentDayKey(to), from, to, clamped };
  }
  const month = typeof sp.m === 'string' && MONTH_RE.test(sp.m) ? sp.m : currentMonth;
  const { start, lastDay } = tashkentMonthBounds(month);
  return { month, currentMonth, isRange: false, fromDay: `${month}-01`, toDay: lastDay, from: start, to: tashkentDayStart(lastDay), clamped: false };
}

/** Sahifa havolasi: mavjud parametrlar + o'zgarishlar (bo'sh qiymat — olib tashlanadi) */
export function pwHref(base: string, cur: Record<string, string | undefined>, patch: Record<string, string | undefined> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...cur, ...patch })) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/** Davr parametrlari (oy yoki oraliq) — havolalarda saqlanadi */
export function rangeParams(r: PwRange): Record<string, string | undefined> {
  return r.isRange ? { from: r.fromDay, to: r.toDay, m: undefined } : { m: r.month === r.currentMonth ? undefined : r.month, from: undefined, to: undefined };
}

/** Kun kaliti (YYYY-MM-DD) → «DD.MM.YYYY» (server vaqt zonasidan mustaqil) */
export const dayLabel = (key: string): string => key.split('-').reverse().join('.');
