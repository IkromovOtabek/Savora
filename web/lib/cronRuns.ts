import { NextRequest, NextResponse } from 'next/server';
import { cronSecretOk } from './security';
import { getMasterModels } from './masterDb';
import { logError } from './logger';
import { recordSecurityEvent, requestMeta, instanceId } from './securityEvents';
import type { CronJob } from './models/master/CronRun';

/**
 * Cron ishini bajaradi va natijasini master DB (cron_runs) ga yozadi.
 * Monitoring sahifasida "oxirgi marta qachon, qancha vaqt, xato bo'ldimi" ko'rinadi.
 */
export async function runCronJob(
  job: CronJob,
  fn: () => Promise<Record<string, unknown>>,
  trigger: 'cron' | 'manual' = 'cron',
): Promise<{ ok: boolean; result?: Record<string, unknown>; error?: string }> {
  const startedAt = new Date();
  let ok = false;
  let result: Record<string, unknown> | undefined;
  let error: string | undefined;
  try {
    result = await fn();
    ok = true;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    logError(`Cron ishi xato: ${job}`, err, { job, trigger });
  }
  const finishedAt = new Date();
  try {
    const { CronRun } = await getMasterModels();
    await CronRun.create({
      job,
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      ok,
      result,
      error: error?.slice(0, 500),
      trigger,
      instance: instanceId(),
    });
  } catch {
    /* tarix yozilmasa ham ish natijasi qaytadi */
  }
  return { ok, result, error };
}

/**
 * /api/cron/<job> route'lari uchun umumiy handler:
 *   1) `Authorization: Bearer CRON_SECRET` (timing-safe; ?secret= faqat dev'da)
 *   2) rad etilsa — xavfsizlik hodisasi (cron_forbidden) yoziladi
 *   3) ish bajarilib, natija cron_runs'ga yoziladi
 */
export async function handleCronRequest(
  req: NextRequest,
  job: CronJob,
  fn: () => Promise<Record<string, unknown>>,
): Promise<NextResponse> {
  const ok = cronSecretOk(
    req.headers.get('authorization'),
    req.nextUrl.searchParams.get('secret'),
    process.env.CRON_SECRET,
    process.env.NODE_ENV === 'production',
  );
  if (!ok) {
    recordSecurityEvent('cron_forbidden', { ...requestMeta(req.headers), zone: 'api', path: `/api/cron/${job}` });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const run = await runCronJob(job, fn, 'cron');
  if (!run.ok) return NextResponse.json({ ok: false, error: run.error }, { status: 500 });
  return NextResponse.json({ ok: true, ...run.result });
}
