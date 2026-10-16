import { setLogSink, type LogRecord } from './logger';
import { getMasterModels } from './masterDb';
import { instanceId } from './securityEvents';

// Daqiqasiga eng ko'pi bilan shuncha yozuv (xato "bo'roni" bazani to'ldirmasin)
const MAX_PER_MINUTE = 60;
let windowStart = 0;
let windowCount = 0;

function allowed(now: number): boolean {
  if (now - windowStart > 60_000) {
    windowStart = now;
    windowCount = 0;
  }
  if (windowCount >= MAX_PER_MINUTE) return false;
  windowCount++;
  return true;
}

/** Jurnal yozuvini master DB (system_logs) ga yozadi — fire-and-forget */
export function writeSystemLog(rec: LogRecord): void {
  if (!allowed(Date.now())) return;
  void (async () => {
    try {
      const { SystemLog } = await getMasterModels();
      await SystemLog.create({
        level: rec.level,
        msg: rec.msg.slice(0, 500),
        error: rec.error?.slice(0, 1000),
        stack: rec.stack,
        meta: rec.meta,
        instance: instanceId(),
        version: process.env.APP_VERSION || undefined,
        at: rec.at,
      });
    } catch {
      /* DB yo'q bo'lsa — konsol logi allaqachon yozilgan */
    }
  })();
}

/** instrumentation.ts → register() dan bir marta chaqiriladi */
export function installDbLogSink(): void {
  setLogSink(writeSystemLog);
}
