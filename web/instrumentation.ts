/**
 * Next.js instrumentation — server ishga tushganda bir marta chaqiriladi.
 *
 * 1) Production'da env tekshiruvi (lib/env.ts → startupEnvCheck): majburiy sozlama yo'q
 *    bo'lsa server ishga tushmaydi (yarim sozlangan holda "jim" ishlab, keyin buzilgandan yaxshi).
 * 2) onRequestError — ushlanmagan server xatolarini logger + ERROR_WEBHOOK_URL ga yuboradi.
 *
 * Node-only kod `NEXT_RUNTIME === 'nodejs'` bloki ichida dinamik import qilinadi —
 * Edge (middleware) bundle'iga tushmaydi.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startupEnvCheck } = await import('./lib/env');
    startupEnvCheck();
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
