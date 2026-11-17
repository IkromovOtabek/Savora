import { NextResponse } from 'next/server';
import { parseReportRange, restaurantReport } from '@/lib/restaurant/reports';
import { toResponse } from '@/lib/restaurant/session';
import { apiCtx, noStore } from '../../_shared';

/**
 * Restoran hisoboti (oshxona vaqtlari, ofitsant KPI, bekor qilinganlar, savdo):
 * `?p=today|yesterday|week|month` yoki `?from=YYYY-MM-DD&to=YYYY-MM-DD` (≤93 kun), `&branchId=` (egasi; xodim — o'z filiali).
 * Javob — `RestaurantReport` (lib/restaurant/reports.ts).
 */
export async function GET(req: Request) {
  const a = await apiCtx(req);
  if (a instanceof NextResponse) return a;
  const sp = new URL(req.url).searchParams;
  const range = parseReportRange({ p: sp.get('p'), from: sp.get('from'), to: sp.get('to') });
  return noStore(toResponse(await restaurantReport(a.ctx, { from: range.from, to: range.to, branchId: a.q.branchId })));
}
