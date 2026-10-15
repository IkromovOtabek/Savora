/**
 * Dashboard'dagi haftalik tushum grafigi uchun kunlik chegaralar.
 * Server mahalliy vaqti bo'yicha (bugungi KPI'dagi `todayStart` bilan bir xil).
 * Bu fayl client'da ham ishlaydi (DB importi yo'q).
 */

const WEEKDAY_SHORT = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'];

export interface DayPoint {
  /** Hafta kuni qisqa nomi (Du, Se, ...) */
  label: string;
  /** DD.MM */
  date: string;
  total: number;
  count: number;
}

/** Oxirgi `days` kunning boshlanish vaqtlari + ertangi kun boshi (jami days+1 chegara, o'sish tartibida). */
export function dayBoundaries(now: Date, days = 7): Date[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const out: Date[] = [];
  for (let i = days - 1; i >= -1; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(d);
  }
  return out;
}

/** Mongo `$bucket` natijasini (_id = kun boshi) kunlik nuqtalarga aylantiradi; bo'sh kunlar 0. */
export function toDayPoints(
  boundaries: Date[],
  buckets: { _id: Date | string; total?: number; count?: number }[],
): DayPoint[] {
  const byTime = new Map<number, { total: number; count: number }>();
  for (const b of buckets) {
    const t = new Date(b._id).getTime();
    if (Number.isNaN(t)) continue;
    byTime.set(t, { total: b.total ?? 0, count: b.count ?? 0 });
  }
  const pad = (x: number) => String(x).padStart(2, '0');
  return boundaries.slice(0, -1).map((d) => {
    const v = byTime.get(d.getTime()) ?? { total: 0, count: 0 };
    return {
      label: WEEKDAY_SHORT[d.getDay()],
      date: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`,
      total: v.total,
      count: v.count,
    };
  });
}

/**
 * Catmull-Rom → kubik Bezier: nuqtalardan silliq SVG yo'l.
 * Boshqaruv nuqtalarining Y qiymati segment chegarasida ushlab turiladi — egri chiziq
 * nol chizig'idan pastga yoki cho'qqidan yuqoriga "otib" ketmaydi (overshoot yo'q).
 */
export function smoothPath(pts: [number, number][]): string {
  if (pts.length === 0) return '';
  const f = (n: number) => n.toFixed(1);
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const lo = Math.min(p1[1], p2[1]);
    const hi = Math.max(p1[1], p2[1]);
    const clampY = (v: number) => Math.min(hi, Math.max(lo, v));
    const c1y = clampY(p1[1] + (p2[1] - p0[1]) / 6);
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = clampY(p2[1] - (p3[1] - p1[1]) / 6);
    d += ` C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}
