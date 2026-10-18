/**
 * Rate limiter (brute-force himoyasi).
 *
 * - `REDIS_URL` bo'lsa — Redis'da (INCR + PEXPIRE, atomik Lua): bir nechta instance
 *   (savora-a/b, PM2 cluster) bitta hisobni ko'radi.
 * - Aks holda yoki Redis vaqtincha ishlamasa — PROCESS ichidagi xotira (zaxira).
 */
import { getRedis } from './redis';

interface Entry {
  count: number;
  resetAt: number;
}

const globalForRl = global as unknown as { _savoraRateLimit?: Map<string, Entry> };
const store: Map<string, Entry> = globalForRl._savoraRateLimit ?? new Map();
globalForRl._savoraRateLimit = store;

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec?: number;
  remaining?: number;
}

/** Eskirgan yozuvlar shu chegaradan oshganda tozalanadi (Map cheksiz o'smasin — anonim kalitlar: analytics:<ip>, login:<istalgan>) */
const SWEEP_THRESHOLD = 20_000;

function sweepExpired(now: number): void {
  if (store.size < SWEEP_THRESHOLD) return;
  for (const [k, e] of store) {
    if (now > e.resetAt) store.delete(k);
  }
}

/** Xotiradagi hisob (zaxira va testlar uchun) */
export function hitRateLimitLocal(key: string, max = 6, windowMs = 15 * 60 * 1000): RateLimitResult {
  const now = Date.now();
  sweepExpired(now);
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: max - 1 };
  }

  if (entry.count >= max) {
    return { ok: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count += 1;
  return { ok: true, remaining: max - entry.count };
}

// INCR; birinchi urinishda muddat qo'yiladi; [hisob, qolgan ms] qaytadi
const HIT_SCRIPT = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
return {c, ttl}
`;
const KEY_PREFIX = 'savora:rl:';

/**
 * Kalit bo'yicha urinishni tekshiradi va hisoblaydi.
 * @param key   masalan `login:<username>` yoki `reset:<slug>`
 * @param max   oyna ichidagi maksimal urinish (default 6)
 * @param windowMs  oyna (default 15 daqiqa)
 */
export async function hitRateLimit(key: string, max = 6, windowMs = 15 * 60 * 1000): Promise<RateLimitResult> {
  const redis = await getRedis();
  if (redis) {
    try {
      const [count, ttl] = (await redis.eval(HIT_SCRIPT, 1, KEY_PREFIX + key, String(windowMs))) as [number, number];
      if (count > max) return { ok: false, retryAfterSec: Math.max(1, Math.ceil(ttl / 1000)) };
      return { ok: true, remaining: max - count };
    } catch {
      /* Redis xatosi — xotiradagi zaxira */
    }
  }
  return hitRateLimitLocal(key, max, windowMs);
}

/** Muvaffaqiyatli kirishdan keyin urinishlarni tozalash */
export async function clearRateLimit(key: string): Promise<void> {
  store.delete(key);
  const redis = await getRedis();
  if (!redis) return;
  try {
    await redis.del(KEY_PREFIX + key);
  } catch {
    /* Redis xatosi — kalit o'z muddatida o'chadi */
  }
}

/** Monitoring uchun: xotiradagi cheklov yozuvlari holati (kalit nomlari chiqarilmaydi; Redis rejimida faqat zaxira hisobi) */
export function rateLimitStats(now = Date.now()): { keys: number; blocked: number; loginKeys: number } {
  let keys = 0;
  let blocked = 0;
  let loginKeys = 0;
  for (const [key, e] of store) {
    if (now > e.resetAt) continue;
    keys++;
    if (key.startsWith('login')) loginKeys++;
    // Standart login limiti 6 — shundan oshgan kalit "bloklangan" hisoblanadi
    if (e.count >= 6) blocked++;
  }
  return { keys, blocked, loginKeys };
}
