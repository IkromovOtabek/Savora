/**
 * Sana + N oy; oy oxiridan oshib ketmaydi (31-yanvar + 1 oy → 28/29-fevral, 3-mart emas).
 * `Date.setMonth` dan farqli — kun soni maqsad oyning oxirgi kuni bilan cheklanadi.
 */
export function addMonthsClamped(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}
