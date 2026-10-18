/**
 * Rate limiter: xotira rejimi doim; Redis rejimi — REDIS_TEST_URL berilsa
 *   REDIS_TEST_URL=redis://127.0.0.1:6390 npx vitest run tests/rateLimit.test.ts
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

const REDIS = process.env.REDIS_TEST_URL;

describe('rateLimit (xotira)', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.REDIS_URL;
  });

  it('max dan keyin bloklaydi, clear tozalaydi', async () => {
    const { hitRateLimit, clearRateLimit } = await import('@/lib/rateLimit');
    const key = `t-mem-${Date.now()}`;
    for (let i = 0; i < 3; i++) expect((await hitRateLimit(key, 3, 60_000)).ok).toBe(true);
    const blocked = await hitRateLimit(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    await clearRateLimit(key);
    expect((await hitRateLimit(key, 3, 60_000)).ok).toBe(true);
  });
});

describe("rateLimit (Redis ishlamasa)", () => {
  it('xotiraga tez o\'tadi, xato tashlamaydi', async () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:1';
    vi.resetModules();
    const { hitRateLimit } = await import('@/lib/rateLimit');
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = Date.now();
    expect((await hitRateLimit(`t-down-${t}`, 2, 60_000)).ok).toBe(true);
    expect(Date.now() - t).toBeLessThan(3000);
    spy.mockRestore();
    const { getRedis } = await import('@/lib/redis');
    await getRedis();
    (global as unknown as { _savoraRedis?: { disconnect(): void } | null })._savoraRedis?.disconnect();
    delete (global as unknown as { _savoraRedis?: unknown })._savoraRedis;
    delete process.env.REDIS_URL;
  });
});

describe.skipIf(!REDIS)('rateLimit (Redis)', () => {
  afterAll(async () => {
    const { getRedis } = await import('@/lib/redis');
    (await getRedis())?.disconnect();
    delete process.env.REDIS_URL;
  });

  beforeEach(() => {
    delete (global as unknown as { _savoraRedis?: unknown })._savoraRedis;
  });

  it('hisob Redis\'da — xotira tozalansa ham saqlanadi (boshqa instance kabi)', async () => {
    process.env.REDIS_URL = REDIS;
    vi.resetModules();
    const { hitRateLimit, clearRateLimit } = await import('@/lib/rateLimit');
    const key = `t-redis-${Date.now()}`;
    expect((await hitRateLimit(key, 2, 60_000)).ok).toBe(true);
    // Boshqa instance: xotiradagi Map bo'sh — lekin Redis hisobi umumiy
    (global as unknown as { _savoraRateLimit?: Map<string, unknown> })._savoraRateLimit?.clear();
    expect((await hitRateLimit(key, 2, 60_000)).ok).toBe(true);
    const r = await hitRateLimit(key, 2, 60_000);
    expect(r.ok).toBe(false);
    expect(r.retryAfterSec).toBeGreaterThan(50);
    await clearRateLimit(key);
    expect((await hitRateLimit(key, 2, 60_000)).ok).toBe(true);
    await clearRateLimit(key);
  });
});
