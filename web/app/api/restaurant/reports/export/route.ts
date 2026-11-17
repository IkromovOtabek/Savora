import { NextResponse } from 'next/server';
import { needPerm } from '@/lib/restaurant/context';
import { REPORT_CSV_SECTIONS, parseReportRange, reportCsv, restaurantReport } from '@/lib/restaurant/reports';
import { errorResponse } from '@/lib/restaurant/session';
import { apiCtx } from '../../_shared';

/**
 * Restoran hisoboti bo'limi CSV: `?section=kitchen|staff|voids|sales` + sahifa filtrlari (`p`, `from`, `to`, `branchId`).
 * Huquqlar: `export.data` (o'chiq «Eksport» modulida huquq yo'q) + hisobotning o'zi (`tables`, `reports.view`).
 */
export async function GET(req: Request) {
  const a = await apiCtx(req);
  if (a instanceof NextResponse) return a;
  const { ctx } = a;
  const denied = needPerm(ctx, 'export.data');
  if (denied) return errorResponse(denied);
  const sp = new URL(req.url).searchParams;
  const section = REPORT_CSV_SECTIONS.find((s) => s === sp.get('section'));
  if (!section) return NextResponse.json({ error: ctx.d.restaurant.errors.badInput, code: 'badInput' }, { status: 400 });
  const range = parseReportRange({ p: sp.get('p'), from: sp.get('from'), to: sp.get('to') });
  const r = await restaurantReport(ctx, { from: range.from, to: range.to, branchId: a.q.branchId });
  if (!r.ok) return errorResponse(r);
  const name = `restoran-${section}-${range.fromDay}_${range.toDay}.csv`;
  return new NextResponse('\uFEFF' + reportCsv(r.data, section, ctx.d), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
}
