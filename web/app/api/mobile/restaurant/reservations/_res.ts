import { NextResponse } from 'next/server';
import { parseInput } from '@/lib/validation';
import { restaurantCtxFromMobile } from '@/lib/restaurant/session';
import { searchParamsObject } from '@/lib/restaurant/inputs';
import { reservationSchemas, type ReservationSaveInput, type ReservationSchemas } from '@/lib/restaurant/reservationInputs';
import type { ReservationInput } from '@/lib/restaurant/reservations';
import type { RestaurantCtx } from '@/lib/restaurant/context';

/**
 * Mobil bron API umumiy qismi (docs/RESTORAN_API.md §18): Bearer token → RestaurantCtx (xato matnlari — ilova tilida),
 * zod sxemalari. Javoblar keshlanmaydi.
 */
export async function resCtx(req: Request): Promise<{ ctx: RestaurantCtx; s: ReservationSchemas } | NextResponse> {
  const ctx = await restaurantCtxFromMobile(req);
  if (ctx instanceof NextResponse) return ctx;
  return { ctx, s: reservationSchemas(ctx.d) };
}

export function queryObject(req: Request): Record<string, string> {
  return searchParamsObject(new URL(req.url).searchParams);
}

export function badRequest(error: string): NextResponse {
  return NextResponse.json({ error, code: 'badInput' }, { status: 400 });
}

export function noStore(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

/** zod natijasi → ReservationInput (bo'sh izohlar tashlanadi) */
export function toInput(x: ReservationSaveInput): ReservationInput {
  return { ...x, items: x.items?.map((i) => ({ productId: i.productId, qty: i.qty, optionIds: i.optionIds, note: i.note || undefined })) };
}

export { parseInput };
