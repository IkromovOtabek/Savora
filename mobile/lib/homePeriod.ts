/**
 * Bosh sahifa tushum davri — sof funksiyalar (server: web/lib/period.ts bilan bir xil kalitlar).
 * Preset (Hammasi · Kecha · Bugun · Hafta · Oy · Yil) yoki aniq kun `YYYY-MM-DD` — ikkalasi ham `?p=` da ketadi.
 */

export const PRESET_PERIODS = ['today', 'yesterday', 'week', 'month', 'year', 'all'] as const;
export type PresetPeriod = (typeof PRESET_PERIODS)[number];
export type DayKey = `${number}-${number}-${number}`;
export type HomePeriod = PresetPeriod | DayKey;

const pad = (n: number) => String(n).padStart(2, '0');

/** Sana → YYYY-MM-DD (telefon mahalliy vaqti) */
export function toDayKey(d: Date): DayKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` as DayKey;
}

export function isDayKey(v: unknown): v is DayKey {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** YYYY-MM-DD → mahalliy yarim tun */
export function fromDayKey(k: DayKey): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Tanlangan kun bugun/kecha bo'lsa — preset nomi (server bilan bir xil natija, yorliq esa tanish) */
export function normalizeDay(k: DayKey, now = new Date()): HomePeriod {
  if (k === toDayKey(now)) return 'today';
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  return k === toDayKey(y) ? 'yesterday' : k;
}

/**
 * Kalendar to'ri: oy kunlari haftaning dushanbasidan boshlab, 7 ga karrali (bo'sh kataklar — null).
 * `monthStart` — oyning istalgan kuni.
 */
export function monthGrid(monthStart: Date): (Date | null)[] {
  const y = monthStart.getFullYear();
  const m = monthStart.getMonth();
  const first = new Date(y, m, 1);
  const days = new Date(y, m + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // dushanba = 0
  const cells: (Date | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(new Date(y, m, d));
  while (cells.length % 7) cells.push(null);
  return cells;
}

/** Ikki sana bir oydami */
export function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}
