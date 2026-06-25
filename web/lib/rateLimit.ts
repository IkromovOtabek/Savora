/**
 * Oddiy in-memory rate limiter (brute-force himoyasi).
 *
 * Eslatma: bu PROCESS ichida ishlaydi. Bir nechta instance (PM2 cluster, bir
 * nechta server) bo'lsa — Redis bilan markazlashtirish kerak (keyingi bosqich).
 * Bitta instance uchun login himoyasiga yetarli.
 */
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

/**
 * Kalit bo'yicha urinishni tekshiradi va hisoblaydi.
 * @param key   masalan `login:<username>` yoki `reset:<slug>`
 * @param max   oyna ichidagi maksimal urinish (default 6)
 * @param windowMs  oyna (default 15 daqiqa)
 */
export function hitRateLimit(key: string, max = 6, windowMs = 15 * 60 * 1000): RateLimitResult {
  const now = Date.now();
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

/** Muvaffaqiyatli kirishdan keyin urinishlarni tozalash */
export function clearRateLimit(key: string): void {
  store.delete(key);
}
