/**
 * Next.js instrumentation — server ishga tushganda bir marta chaqiriladi.
 *
 * 1) Production'da env tekshiruvi (lib/env.ts → startupEnvCheck): majburiy sozlama yo'q
 *    bo'lsa server ishga tushmaydi (yarim sozlangan holda "jim" ishlab, keyin buzilgandan yaxshi).
 * 2) onRequestError — ushlanmagan server xatolarini logger + ERROR_WEBHOOK_URL ga yuboradi.
 * 3) DB log sink — xatolar system_logs kolleksiyasiga (Monitoring sahifasi uchun).
 * 4) Sentry — faqat SENTRY_DSN bo'lsa (lib/sentry.ts); logError() orqali yuboriladi.
 *
 * Node-only kod `NEXT_RUNTIME === 'nodejs'` bloki ichida dinamik import qilinadi —
 * Edge (middleware) bundle'iga tushmaydi.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startupEnvCheck } = await import('./lib/env');
    startupEnvCheck();
    // Xatolar master DB (system_logs) ga ham yoziladi — Super Admin → Monitoring
    const { installDbLogSink } = await import('./lib/logSink');
    installDbLogSink();
  }
  if (process.env.SENTRY_DSN) {
    const { initSentryServer } = await import('./lib/sentry');
    await initSentryServer();
  }
}

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { logError } = await import('./lib/logger');
    logError('Ushlanmagan server xatosi', err, {
      path: request.path,
      method: request.method,
      route: context.routePath,
      routeType: context.routeType,
    });
  }
}
