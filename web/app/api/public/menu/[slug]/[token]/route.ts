import { NextResponse } from 'next/server';
import { publicMenu } from '@/lib/restaurant/public';
import { headersFor, LIMITS, publicTable } from '../../_shared';

type Params = { params: Promise<{ slug: string; token: string }> };

/** Mijoz menyusi: do'kon nomi, brend, stol, kategoriyalar, taomlar (stop-list va tugaganlar yashirin) */
export async function GET(req: Request, { params }: Params) {
  const a = await publicTable(req, params, (ip, token) => [LIMITS.readTable(ip, token), LIMITS.readIp(ip)]);
  if (a instanceof NextResponse) return a;
  return headersFor(NextResponse.json(await publicMenu(a.c)));
}
