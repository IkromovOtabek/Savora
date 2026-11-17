import { NextResponse } from 'next/server';
import { listWorkers } from '@/lib/production/piecework';
import { toResponse } from '@/lib/production/session';
import { apiCtx, noStore } from '../_shared';

/** Ishchilar (faol foydalanuvchilar) — ishbay/akt ish haqi tanlovi uchun (`piecework.approve`) */
export async function GET(req: Request) {
  const a = await apiCtx(req);
  if (a instanceof NextResponse) return a;
  return noStore(toResponse(await listWorkers(a.ctx)));
}
