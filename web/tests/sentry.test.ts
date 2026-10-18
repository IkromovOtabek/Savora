import { describe, it, expect, vi, beforeEach } from 'vitest';

const captureException = vi.fn();
const captureMessage = vi.fn();
const init = vi.fn();
const scope = { setTag: vi.fn(), setExtras: vi.fn() };
vi.mock('@sentry/nextjs', () => ({
  init,
  captureException,
  captureMessage,
  withScope: (fn: (s: typeof scope) => void) => fn(scope),
}));

describe('Sentry ilgagi', () => {
  beforeEach(() => {
    vi.resetModules();
    init.mockClear(); captureException.mockClear(); captureMessage.mockClear();
    scope.setExtras.mockClear();
  });

  it("SENTRY_DSN bo'lmasa — init chaqirilmaydi", async () => {
    delete process.env.SENTRY_DSN;
    const { initSentryServer } = await import('@/lib/sentry');
    await initSentryServer();
    expect(init).not.toHaveBeenCalled();
  });

  it("DSN bo'lsa — logError Sentry'ga yuboradi, maxfiy meta yashiriladi", async () => {
    process.env.SENTRY_DSN = 'https://public@o0.ingest.sentry.io/0';
    const { initSentryServer } = await import('@/lib/sentry');
    const { logError, setErrorReporter } = await import('@/lib/logger');
    await initSentryServer();
    expect(init).toHaveBeenCalledTimes(1);
    expect(init.mock.calls[0][0]).toMatchObject({ sendDefaultPii: false, tracesSampleRate: 0 });

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('boom');
    logError('sotuv yiqildi', err, { user: 'ali', password: 'x' });
    expect(captureException).toHaveBeenCalledWith(err);
    expect(scope.setExtras).toHaveBeenCalledWith({ user: 'ali', password: '[yashirildi]' });

    logError('xatosiz xabar');
    expect(captureMessage).toHaveBeenCalledWith('xatosiz xabar', 'error');
    spy.mockRestore();
    setErrorReporter(null);
    delete process.env.SENTRY_DSN;
  });
});
