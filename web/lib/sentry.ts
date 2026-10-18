/**
 * Sentry (xato kuzatuvi) — FAQAT `SENTRY_DSN` berilganda yoqiladi; aks holda paket yuklanmaydi ham.
 *
 * - instrumentation.ts → register() dan chaqiriladi (nodejs va edge).
 * - Barcha `logError()` (va ushlanmagan server xatolari — onRequestError → logError) Sentry'ga
 *   lib/logger.ts dagi ilgak orqali tushadi; ikki marta yuborilmaydi.
 * - Maxfiylik: sendDefaultPii=false, so'rov cookie/sarlavhalari va foydalanuvchi IP'si olib tashlanadi;
 *   meta allaqachon redact() dan o'tgan (parol/token yashirilgan).
 *
 * Ixtiyoriy: SENTRY_ENVIRONMENT (standart NODE_ENV), SENTRY_TRACES_SAMPLE_RATE (standart 0 — faqat xatolar),
 * APP_VERSION → release.
 */
import { setErrorReporter } from './logger';

let started = false;

export async function initSentryServer(): Promise<void> {
  const dsn = (process.env.SENTRY_DSN || '').trim();
  if (!dsn || started) return;
  started = true;
  try {
    const Sentry = await import('@sentry/nextjs');
    const rate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0);
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
      release: process.env.APP_VERSION || undefined,
      tracesSampleRate: Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : 0,
      sendDefaultPii: false,
      beforeSend(event) {
        if (event.request) {
          delete event.request.cookies;
          delete event.request.headers;
          delete event.request.data;
        }
        if (event.user) delete event.user.ip_address;
        return event;
      },
    });
    setErrorReporter((msg, err, meta) => {
      Sentry.withScope((scope) => {
        scope.setTag('log_msg', msg.slice(0, 200));
        if (meta) scope.setExtras(meta);
        if (err instanceof Error) Sentry.captureException(err);
        else Sentry.captureMessage(err ? `${msg}: ${String(err)}` : msg, 'error');
      });
    });
  } catch (err) {
    started = false;
    console.error('[sentry] ishga tushmadi', err instanceof Error ? err.message : err);
  }
}
