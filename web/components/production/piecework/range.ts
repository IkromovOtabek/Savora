/**
 * Ishbay sahifalari (ro'yxat, jamlama, chop etish) uchun davr: URL'dagi `?m=YYYY-MM` (sukut — joriy oy) yoki
 * `?from=YYYY-MM-DD&to=YYYY-MM-DD` oraliq. Sof funksiyalar (server sahifalari va testlar uchun).
 *
 * `to` — kun oxiri (23:59:59.999, mahalliy vaqt): lib/production/common.ts → dateRange UTC yarim tunni
 * «kun oxirigacha» deb bir kun suradi, bu qiymat esa hech qachon UTC 00:00 bo'lmaydi — chegara siljimaydi.
 */
import { isDayPeriod, toDayKey } from '@/lib/period';
import { PRODUCTION_LIMITS } from '@/lib/production/calc';

export interface PwRange {
  /** Oy rejimi: YYYY-MM; oraliqda — boshlanish oyi */
  month: string;
  /** Joriy oy (MonthNav uchun) */
  currentMonth: string;
  isRange: boolean;
  fromDay: string;
  toDay: string;
  from: Date;
  to: Date;
  /** Oraliq chegaradan uzun edi — qisqartirildi */
  clamped: boolean;
}

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const dayStart = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
};
const dayEnd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
};

export function parsePwRange(sp: { m?: string; from?: string; to?: string }, now = new Date()): PwRange {
  const currentMonth = ym(now);
  const maxDays = PRODUCTION_LIMITS.maxPeriodDays;
  if (isDayPeriod(sp.from) && isDayPeriod(sp.to) && sp.from <= sp.to) {
    const from = dayStart(sp.from);
    let to = dayEnd(sp.to);
    let clamped = false;
    // Server ham ≤ 366 kun qiladi (pieceworkSummary) — bu yerda oldindan, ko'rsatiladigan sana to'g'ri bo'lsin
    const limit = new Date(from);
    limit.setDate(limit.getDate() + maxDays - 1);
    if (to > dayEnd(toDayKey(limit))) { to = dayEnd(toDayKey(limit)); clamped = true; }
    return { month: ym(from), currentMonth, isRange: true, fromDay: sp.from, toDay: toDayKey(to), from, to, clamped };
  }
  const mm = typeof sp.m === 'string' ? MONTH_RE.exec(sp.m) : null;
  const y = mm ? Number(mm[1]) : now.getFullYear();
  const m = mm ? Number(mm[2]) - 1 : now.getMonth();
  const from = new Date(y, m, 1, 0, 0, 0, 0);
  const to = new Date(y, m + 1, 0, 23, 59, 59, 999);
  return { month: ym(from), currentMonth, isRange: false, fromDay: toDayKey(from), toDay: toDayKey(to), from, to, clamped: false };
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
