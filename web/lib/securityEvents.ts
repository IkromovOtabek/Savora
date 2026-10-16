import { getMasterModels } from './masterDb';
import { clientIpFrom } from './security';
import type { SecurityEventType } from './models/master/SecurityEvent';

/** Jarayon identifikatori (app_a / app_b ni ajratish uchun) */
export function instanceId(): string {
  const host = process.env.HOSTNAME || 'local';
  return `${host}:${process.pid}`;
}

interface EventInput {
  username?: string;
  ip?: string;
  userAgent?: string;
  zone?: string;
  slug?: string;
  path?: string;
  note?: string;
}

/**
 * Xavfsizlik hodisasini master DB'ga yozadi (fire-and-forget).
 * Hech qachon throw qilmaydi va asosiy oqimni kutdirmaydi — login/cron javobi
 * bazaga yozish tugashini kutmaydi.
 */
export function recordSecurityEvent(type: SecurityEventType, input: EventInput = {}): void {
  void (async () => {
    try {
      const { SecurityEvent } = await getMasterModels();
      await SecurityEvent.create({
        type,
        username: input.username?.slice(0, 80),
        ip: input.ip?.slice(0, 64),
        userAgent: input.userAgent?.slice(0, 200),
        zone: input.zone,
        slug: input.slug?.slice(0, 80),
        path: input.path?.slice(0, 120),
        note: input.note?.slice(0, 200),
        at: new Date(),
      });
    } catch {
      /* jurnal yozilmasa ham asosiy amal davom etadi */
    }
  })();
}

/** So'rov sarlavhalaridan IP + User-Agent */
export function requestMeta(h: { get(name: string): string | null }): { ip: string; userAgent: string } {
  return { ip: clientIpFrom(h), userAgent: h.get('user-agent') || '' };
}
