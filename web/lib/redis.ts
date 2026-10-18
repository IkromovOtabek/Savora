import type Redis from 'ioredis';
import { logWarn } from './logger';

/**
 * Ixtiyoriy Redis ulanishi — FAQAT `REDIS_URL` berilganda (masalan redis://127.0.0.1:6379/0).
 * Hozir: markazlashgan rate-limit (bir nechta instance — savora-a/b — bitta hisobni ko'radi).
 *
 * Redis ishlamay qolsa ilova to'xtamaydi: chaqiruvchi null oladi va xotiradagi zaxiraga o'tadi.
 * Faqat server (nodejs) — Edge/middleware'da ishlatilmaydi.
 */
const g = global as unknown as { _savoraRedis?: Redis | null; _savoraRedisWarned?: number };

export async function getRedis(): Promise<Redis | null> {
  const url = (process.env.REDIS_URL || '').trim();
  if (!url) return null;
  if (g._savoraRedis !== undefined) return g._savoraRedis && g._savoraRedis.status === 'ready' ? g._savoraRedis : null;

  try {
    const { default: IORedis } = await import('ioredis');
    const client = new IORedis(url, {
      // So'rov Redis'ni kutib qolmasin: ulanish yo'q bo'lsa darhol xato → zaxira
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: false,
    });
    client.on('error', (err) => {
      // Spam bo'lmasin — daqiqada bir marta
      const now = Date.now();
      if (!g._savoraRedisWarned || now - g._savoraRedisWarned > 60_000) {
        g._savoraRedisWarned = now;
        logWarn('Redis xatosi — xotiradagi zaxiradan foydalanilmoqda', { error: err.message });
      }
    });
    g._savoraRedis = client;
    if (client.status !== 'ready') {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 2000);
        client.once('ready', () => { clearTimeout(t); resolve(); });
      });
    }
    return client.status === 'ready' ? client : null;
  } catch (err) {
    g._savoraRedis = null;
    logWarn('Redis ulanmadi', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
