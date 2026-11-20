import { NextResponse } from 'next/server';
import { readJsonInput } from '@/lib/validation';
import { restaurantCtxFromApi, toResponse } from '@/lib/restaurant/session';
import { restaurantSchemas } from '@/lib/restaurant/inputs';
import { printStationPoll } from '@/lib/restaurant/printQueue';
import { noStore } from '../_shared';

/**
 * Printer stansiyasi (oshxona printeri, /app/kitchen/print) so'rovi — 3 s polling.
 * Body: { deviceId, branchId?, stationId?, claim? } → { jobs (shu qurilmaga berilgan varaqlar), recent, stations, branches }.
 * POST — `claim` varaqlarni qurilmaga biriktiradi (yozuv). Hujjat: docs/RESTORAN_API.md → «Oshxona printeri».
 */
export async function POST(req: Request) {
  const ctx = await restaurantCtxFromApi();
  if (ctx instanceof NextResponse) return ctx;
  const bad = ctx.d.restaurant.errors.badInput;
  const b = await readJsonInput(req, restaurantSchemas(ctx.d.restaurant.errors).printPoll, { badJson: bad, fallback: bad });
  if (!b.ok) return NextResponse.json({ error: b.error, code: 'badInput' }, { status: 400 });
  return noStore(toResponse(await printStationPoll(ctx, b.data)));
}
