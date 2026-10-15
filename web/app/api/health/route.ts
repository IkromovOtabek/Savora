import { NextRequest, NextResponse } from 'next/server';
import { getBaseConnection } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DB_TIMEOUT_MS = 2000;
const startedAt = Date.now();

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * Sog'liq tekshiruvi (sirlar chiqarilmaydi).
 *   GET /api/health          — readiness: master DB ping (2 s timeout). 200 = tayyor, 503 = DB yo'q.
 *   GET /api/health?live=1   — liveness: faqat jarayon tirikligi (DB'ga tegmaydi), doim 200.
 * Docker HEALTHCHECK, uptime monitoring va deploy skripti shu manzilni ishlatadi.
 */
export async function GET(req: NextRequest) {
  const headers = { 'Cache-Control': 'no-store, max-age=0' };
  const base = {
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    version: process.env.APP_VERSION || undefined,
    time: new Date().toISOString(),
  };

  if (req.nextUrl.searchParams.has('live')) {
    return NextResponse.json({ status: 'ok', check: 'live', ...base }, { headers });
  }

  const t0 = Date.now();
  try {
    await withTimeout(
      (async () => {
        const conn = await getBaseConnection();
        if (!conn.db) throw new Error('no db');
        await conn.db.admin().ping();
      })(),
      DB_TIMEOUT_MS,
    );
    return NextResponse.json(
      { status: 'ok', check: 'ready', db: 'up', dbLatencyMs: Date.now() - t0, ...base },
      { headers },
    );
  } catch {
    // Xato tafsiloti (ulanish satri, host) tashqariga chiqarilmaydi
    return NextResponse.json(
      { status: 'degraded', check: 'ready', db: 'down', ...base },
      { status: 503, headers },
    );
  }
}
