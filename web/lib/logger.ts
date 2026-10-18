/**
 * Markazlashtirilgan xato/log qatlami.
 *
 * - Production: har log — bitta qatorli JSON (docker logs / journald / Loki uchun qulay).
 * - Dev: o'qish oson bo'lishi uchun qisqa matn + meta.
 * - Xatolar (`logError`) qo'shimcha ravishda `reportError()` orqali ixtiyoriy
 *   ERROR_WEBHOOK_URL ga POST qilinadi (Slack/Discord/n8n/Telegram-relay va h.k.).
 * - SENTRY_DSN berilgan bo'lsa — lib/sentry.ts ro'yxatga olgan "reporter" orqali Sentry'ga ham
 *   (logger Sentry paketini o'zi import qilmaydi — sink kabi ilgak).
 *
 * Maxfiylik: meta ichidagi parol/token/secret/cookie kalitlari avtomatik yashiriladi.
 */
type Meta = Record<string, unknown>;
type Level = 'error' | 'warn' | 'info';

const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|initdata|session/i;
const MAX_STACK = 4000;

/** Meta ichidagi maxfiy maydonlarni yashiradi (1 daraja chuqurlikkacha rekursiv) */
export function redact(meta: Meta | undefined, depth = 0): Meta | undefined {
  if (!meta) return meta;
  const out: Meta = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE_KEY.test(k)) out[k] = '[yashirildi]';
    else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && depth < 2) {
      out[k] = redact(v as Meta, depth + 1);
    } else out[k] = v;
  }
  return out;
}

function isProd() {
  return process.env.NODE_ENV === 'production';
}

function emit(level: Level, msg: string, meta?: Meta) {
  const safe = redact(meta);
  if (isProd()) {
    const line = JSON.stringify({ level, msg, ts: new Date().toISOString(), ...safe });
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
    return;
  }
  const tag = level === 'error' ? '[xato]' : level === 'warn' ? '[ogoh]' : '[info]';
  const args: unknown[] = [`${tag} ${msg}`];
  if (safe && Object.keys(safe).length) args.push(safe);
  if (level === 'error') console.error(...args);
  else if (level === 'warn') console.warn(...args);
  else console.log(...args);
}

// ── Tashqi xabar (webhook) ──────────────────────────────────────────────
// Bir xil xato bir daqiqada bir martadan ko'p yuborilmaydi (spam/loop himoyasi).
const DEDUPE_MS = 60_000;
const MAX_PER_MINUTE = 20;
const globalForReport = global as unknown as {
  _savoraErrSeen?: Map<string, number>;
  _savoraErrWindow?: { start: number; count: number };
};
const seen: Map<string, number> = globalForReport._savoraErrSeen ?? new Map();
globalForReport._savoraErrSeen = seen;

function shouldSend(key: string, now: number): boolean {
  const w = (globalForReport._savoraErrWindow ??= { start: now, count: 0 });
  if (now - w.start > 60_000) {
    w.start = now;
    w.count = 0;
  }
  if (w.count >= MAX_PER_MINUTE) return false;
  const last = seen.get(key);
  if (last && now - last < DEDUPE_MS) return false;
  seen.set(key, now);
  if (seen.size > 500) {
    for (const [k, t] of seen) if (now - t > DEDUPE_MS) seen.delete(k);
  }
  w.count++;
  return true;
}

/**
 * Xatoni ixtiyoriy ERROR_WEBHOOK_URL ga yuboradi (fire-and-forget, 3 s timeout).
 * Payload — umumiy JSON; `text` (Slack) va `content` (Discord) maydonlari ham bor.
 * Hech qachon tashlamaydi va so'rovni sekinlashtirmaydi.
 */
export function reportError(msg: string, err?: unknown, meta?: Meta): void {
  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;
  try {
    const now = Date.now();
    const errMsg = err instanceof Error ? err.message : err ? String(err) : '';
    if (!shouldSend(`${msg}|${errMsg}`, now)) return;

    const app = process.env.NEXT_PUBLIC_APP_URL || 'savora';
    const version = process.env.APP_VERSION || '';
    const summary = `[Savora xato] ${msg}${errMsg ? ` — ${errMsg}` : ''}`.slice(0, 1800);
    const body = {
      text: summary,
      content: summary,
      level: 'error',
      msg,
      error: errMsg || undefined,
      stack: err instanceof Error && err.stack ? err.stack.slice(0, MAX_STACK) : undefined,
      meta: redact(meta),
      app,
      version: version || undefined,
      env: process.env.NODE_ENV,
      ts: new Date(now).toISOString(),
    };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
      .catch(() => {
        /* webhook ishlamasa — log allaqachon yozilgan */
      })
      .finally(() => clearTimeout(timer));
  } catch {
    /* hech qachon tashlamaydi */
  }
}

// ── Ichki jurnal (DB sink) ─────────────────────────────────────────────
// Logger'ning o'zi mongoose'ga bog'lanmaydi (client bundle'ga tushib qolmasligi uchun).
// instrumentation.ts server start'da lib/logSink.ts dagi yozuvchini ro'yxatga oladi.
export interface LogRecord {
  level: 'error' | 'warn';
  msg: string;
  error?: string;
  stack?: string;
  meta?: Meta;
  at: Date;
}
type Sink = (rec: LogRecord) => void;
const globalForSink = global as unknown as { _savoraLogSink?: Sink };

export function setLogSink(sink: Sink | null): void {
  globalForSink._savoraLogSink = sink ?? undefined;
}

function toSink(level: 'error' | 'warn', msg: string, err: unknown, meta?: Meta) {
  const sink = globalForSink._savoraLogSink;
  if (!sink) return;
  try {
    sink({
      level,
      msg,
      error: err instanceof Error ? err.message : err ? String(err) : undefined,
      stack: err instanceof Error && err.stack ? err.stack.slice(0, MAX_STACK) : undefined,
      meta: redact(meta),
      at: new Date(),
    });
  } catch {
    /* sink hech qachon asosiy oqimni buzmaydi */
  }
}

// ── Tashqi xato kuzatuvi (Sentry) ilgagi ───────────────────────────────
type Reporter = (msg: string, err: unknown, meta?: Meta) => void;
const globalForReporter = global as unknown as { _savoraErrReporter?: Reporter };

export function setErrorReporter(fn: Reporter | null): void {
  globalForReporter._savoraErrReporter = fn ?? undefined;
}

function toReporter(msg: string, err: unknown, meta?: Meta) {
  const fn = globalForReporter._savoraErrReporter;
  if (!fn) return;
  try {
    fn(msg, err, redact(meta));
  } catch {
    /* reporter hech qachon asosiy oqimni buzmaydi */
  }
}

export function logError(msg: string, err?: unknown, meta?: Meta) {
  const errInfo =
    err instanceof Error
      ? { error: err.message, stack: err.stack?.slice(0, MAX_STACK) }
      : err
        ? { error: String(err) }
        : {};
  emit('error', msg, { ...meta, ...errInfo });
  reportError(msg, err, meta);
  toSink('error', msg, err, meta);
  toReporter(msg, err, meta);
}

export function logWarn(msg: string, meta?: Meta) {
  emit('warn', msg, meta);
  toSink('warn', msg, undefined, meta);
}

export function logInfo(msg: string, meta?: Meta) {
  emit('info', msg, meta);
}
