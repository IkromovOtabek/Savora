import { NextResponse } from 'next/server';
import { z } from 'zod';
import { WAITER_DAY_PERIODS, waiterDay } from '@/lib/restaurant/waiterDay';
import { toResponse } from '@/lib/restaurant/session';
import { badRequest, mobileCtx, noStore, queryOf } from '../_shared';

const periodSchema = z.enum(WAITER_DAY_PERIODS).optional();

/**
 * Ofitsant kabineti «Mening kunim»: `?p=today|week|month` (sukut — bugun), `&branchId=` (egasi; xodim — o'z filiali).
 * Faqat joriy foydalanuvchining buyurtmalari (Bearer token → user.id). Javob — `WaiterDay` (lib/restaurant/waiterDay.ts).
 */
export async function GET(req: Request) {
  const a = await mobileCtx(req);
  if (a instanceof NextResponse) return a;
  const q = queryOf(req, a);
  if (!q.ok) return badRequest(q.error);
  const p = periodSchema.safeParse(new URL(req.url).searchParams.get('p') ?? undefined);
  if (!p.success) return badRequest(a.ctx.d.restaurant.errors.badInput);
  return noStore(toResponse(await waiterDay(a.ctx, { period: p.data, branchId: q.data.branchId })));
}
