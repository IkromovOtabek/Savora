/**
 * Hisobot davrlari (BILLZ uslubi: Hammasi · Kecha · Bugun · Hafta · Oy · Yil) + aniq kun — sof funksiyalar.
 * Aniq kun ham o'sha `?p=` parametrida keladi: `?p=2026-11-10`.
 */

export const PERIOD_KEYS = ['all', 'yesterday', 'today', 'week', 'month', 'year'] as const;
export type PresetPeriod = (typeof PERIOD_KEYS)[number];
/** Aniq kalendar kuni — YYYY-MM-DD */
export type DayPeriod = `${number}-${number}-${number}`;
export type PeriodKey = PresetPeriod | DayPeriod;

/** YYYY-MM-DD va haqiqiy sana (2026-02-31 emas) */
export function isDayPeriod(v: unknown): v is DayPeriod {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return y >= 2000 && dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function parsePeriod(v: unknown, fallback: PeriodKey = 'today'): PeriodKey {
  if (typeof v === 'string' && (PERIOD_KEYS as readonly string[]).includes(v)) return v as PresetPeriod;
  return isDayPeriod(v) ? v : fallback;
}

/** Sana → YYYY-MM-DD (mahalliy vaqt bo'yicha — server kun chegaralari bilan bir xil) */
export function toDayKey(d: Date): DayPeriod {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` as DayPeriod;
}

/**
 * Davr chegaralari [start, end): bugun/kecha/aniq kun — kalendar kuni; hafta/oy/yil — bugunni ham
 * o'z ichiga olgan oxirgi 7 / 30 / 365 kun; hammasi — cheklovsiz (1970-yildan ertagacha).
 */
export function periodRange(key: PeriodKey, now = new Date()): { start: Date; end: Date } {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const back = (days: number) => { const d = new Date(today); d.setDate(d.getDate() - days); return d; };
  switch (key) {
    case 'all': return { start: new Date(0), end: tomorrow };
    case 'yesterday': return { start: back(1), end: today };
    case 'today': return { start: today, end: tomorrow };
    case 'week': return { start: back(6), end: tomorrow };
    case 'month': return { start: back(29), end: tomorrow };
    case 'year': return { start: back(364), end: tomorrow };
    default: {
      const [y, m, d] = key.split('-').map(Number);
      const start = new Date(y, m - 1, d);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return { start, end };
    }
  }
}

/* ───────────── Toshkent vaqti (UTC+5) — server vaqt zonasidan mustaqil kun chegaralari ───────────── */

/**
 * O'zbekiston yagona vaqt zonasi (UTC+5, yozgi vaqt yo'q). Hujjat davr filtrlari (ishlab chiqarish, kirim, ishbay)
 * kunni shu bo'yicha oladi: server qaysi zonada ishlashidan qat'i nazar 00:00–05:00 dagi hujjat o'z kunida qoladi.
 */
export const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/** Lahza → Toshkent kalendar kuni (YYYY-MM-DD) */
export function tashkentDayKey(d: Date): DayPeriod {
  return new Date(d.getTime() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10) as DayPeriod;
}

/** Toshkent kuni (YYYY-MM-DD) boshlanishi — 00:00 UTC+5 lahzasi */
export function tashkentDayStart(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - TASHKENT_OFFSET_MS);
}

/** Lahza aynan Toshkent yarim tuni (00:00:00.000 UTC+5) — «shu kun oxirigacha» degan ma'noda ishlatiladi */
export function isTashkentMidnight(d: Date): boolean {
  return (d.getTime() + TASHKENT_OFFSET_MS) % DAY_MS === 0;
}

/** Toshkent oyi (YYYY-MM) boshlanishi va shu oyning oxirgi kuni (YYYY-MM-DD) */
export function tashkentMonthBounds(ym: string): { start: Date; lastDay: DayPeriod } {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: tashkentDayStart(`${ym}-01`), lastDay: `${ym}-${String(last).padStart(2, '0')}` as DayPeriod };
}

/** `periodRange` ning Toshkent varianti: [start, end) — kun chegaralari UTC+5 bo'yicha */
export function tashkentPeriodRange(key: PeriodKey, now = new Date()): { start: Date; end: Date } {
  const today = tashkentDayStart(tashkentDayKey(now)).getTime();
  const at = (days: number) => new Date(today + days * DAY_MS);
  switch (key) {
    case 'all': return { start: new Date(0), end: at(1) };
    case 'yesterday': return { start: at(-1), end: at(0) };
    case 'today': return { start: at(0), end: at(1) };
    case 'week': return { start: at(-6), end: at(1) };
    case 'month': return { start: at(-29), end: at(1) };
    case 'year': return { start: at(-364), end: at(1) };
    default: {
      const start = tashkentDayStart(key);
      return { start, end: new Date(start.getTime() + DAY_MS) };
    }
  }
}

/** Davr yorlig'i: preset — lug'atdan, aniq kun — "10-noyabr" ko'rinishida (formatDay beradi) */
export function periodLabel(
  key: PeriodKey,
  labels: Record<PresetPeriod, string>,
  formatDay: (d: Date) => string,
): string {
  return isDayPeriod(key) ? formatDay(periodRange(key).start) : labels[key as PresetPeriod];
}
