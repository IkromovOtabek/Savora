import { NextResponse } from 'next/server';
import { readJsonInput } from '@/lib/validation';
import { restaurantCtxFromApi, toResponse } from '@/lib/restaurant/session';
import { restaurantSchemas } from '@/lib/restaurant/inputs';
import { markPrintJobPrinted, reprintPrintJob } from '@/lib/restaurant/printQueue';
import { noStore } from '../../_shared';

/**
 * Varaq amali — { op }:
 *   done    — chop etildi (printer stansiyasi chop etgach)
 *   reprint — «NUSXA» belgili yangi nusxa navbatga (auditga yoziladi)
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await restaurantCtxFromApi();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  const bad = ctx.d.restaurant.errors.badInput;
  const b = await readJsonInput(req, restaurantSchemas(ctx.d.restaurant.errors).printOp, { badJson: bad, fallback: bad });
  if (!b.ok) return NextResponse.json({ error: b.error, code: 'badInput' }, { status: 400 });
  const r = b.data.op === 'done' ? await markPrintJobPrinted(ctx, id) : await reprintPrintJob(ctx, id);
  return noStore(toResponse(r));
}
