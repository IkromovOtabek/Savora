/** Hisobot davrlari (BILLZ uslubi: Kecha · Bugun · Hafta · Oy · Yil) — sof funksiyalar */

export const PERIOD_KEYS = ['yesterday', 'today', 'week', 'month', 'year'] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

export function parsePeriod(v: unknown, fallback: PeriodKey = 'today'): PeriodKey {
  return typeof v === 'string' && (PERIOD_KEYS as readonly string[]).includes(v) ? (v as PeriodKey) : fallback;
}

/**
 * Davr chegaralari [start, end): bugun/kecha — kalendar kuni; hafta/oy/yil — bugunni ham
 * o'z ichiga olgan oxirgi 7 / 30 / 365 kun.
 */
export function periodRange(key: PeriodKey, now = new Date()): { start: Date; end: Date } {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const back = (days: number) => { const d = new Date(today); d.setDate(d.getDate() - days); return d; };
  switch (key) {
    case 'yesterday': return { start: back(1), end: today };
    case 'today': return { start: today, end: tomorrow };
    case 'week': return { start: back(6), end: tomorrow };
    case 'month': return { start: back(29), end: tomorrow };
    case 'year': return { start: back(364), end: tomorrow };
  }
}
