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

/** Davr yorlig'i: preset — lug'atdan, aniq kun — "10-noyabr" ko'rinishida (formatDay beradi) */
export function periodLabel(
  key: PeriodKey,
  labels: Record<PresetPeriod, string>,
  formatDay: (d: Date) => string,
): string {
  return isDayPeriod(key) ? formatDay(periodRange(key).start) : labels[key as PresetPeriod];
}
