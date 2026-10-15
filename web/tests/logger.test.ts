import { describe, it, expect, vi, afterEach } from 'vitest';
import { redact, reportError } from '@/lib/logger';

describe('logger.redact', () => {
  it('parol/token/secret/cookie maydonlarini yashiradi', () => {
    const out = redact({ user: 'ali', password: 'p', token: 't', apiKey: 'k', nested: { secret: 's', ok: 1 } });
    expect(out).toEqual({
      user: 'ali',
      password: '[yashirildi]',
      token: '[yashirildi]',
      apiKey: '[yashirildi]',
      nested: { secret: '[yashirildi]', ok: 1 },
    });
  });
});

describe('logger.reportError', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('ERROR_WEBHOOK_URL bo\'lmasa — hech narsa yubormaydi', () => {
    vi.stubEnv('ERROR_WEBHOOK_URL', '');
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    reportError('test', new Error('x'));
    expect(f).not.toHaveBeenCalled();
  });

  it('yuboradi va bir xil xatoni takrorlamaydi; maxfiy meta yashiriladi', () => {
    vi.stubEnv('ERROR_WEBHOOK_URL', 'https://hooks.example.com/x');
    const f = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', f);
    reportError('dedupe-test', new Error('boom'), { password: 'p', orgId: 'o1' });
    reportError('dedupe-test', new Error('boom'));
    expect(f).toHaveBeenCalledTimes(1);
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body.text).toContain('dedupe-test');
    expect(body.meta).toEqual({ password: '[yashirildi]', orgId: 'o1' });
  });
});
