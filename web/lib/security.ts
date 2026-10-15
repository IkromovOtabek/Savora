import crypto from 'crypto';

/**
 * Xavfsizlik yordamchilari (sof funksiyalar — test qilinadi).
 */

/**
 * Doimiy vaqtli satr solishtirish (timing attack'dan himoya).
 * Uzunliklar har xil bo'lsa ham bir xil vaqt sarflanadi — ikkalasi SHA-256 orqali
 * teng uzunlikka keltiriladi. Bo'sh qiymat hech qachon mos kelmaydi.
 */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb) && a.length === b.length;
}

/** Regex maxsus belgilarini ekranlash (foydalanuvchi qidiruvi uchun) */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Qidiruv satri: kesiladi, uzunligi cheklanadi (default 50), regex uchun ekranlanadi */
export function searchPattern(raw: string | null | undefined, maxLen = 50): string {
  return escapeRegExp(String(raw ?? '').trim().slice(0, maxLen));
}

/**
 * CSV katakchasi: formula injection himoyasi (Excel/Sheets `=`, `+`, `-`, `@`, tab, CR bilan
 * boshlangan qiymatni formula sifatida bajaradi) + qo'shtirnoq ekranlash.
 */
export function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** So'rov sarlavhalaridan mijoz IP manzili (x-forwarded-for birinchi bo'g'ini → x-real-ip) */
export function clientIpFrom(h: { get(name: string): string | null }): string {
  const xff = h.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return h.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * Login rate-limit kalitlari. Slug/zona kalitga KIRMAYDI — aks holda tenantSlug'ni
 * almashtirib cheklovni chetlab o'tish mumkin edi.
 */
export function loginRateKeys(username: string, ip: string, scope = 'login'): { user: string; ip: string } {
  return {
    user: `${scope}:${username.trim().toLowerCase()}`,
    ip: `${scope}-ip:${ip}`,
  };
}

/**
 * Pul summasi (butun so'm). Bo'sh joylar olib tashlanadi. Butun bo'lmagan, manfiy yoki
 * cheksiz qiymat — null. (Server tomonida kasr summalar rad etiladi.)
 */
export function parseIntegerSum(v: unknown): number | null {
  if (typeof v === 'number') {
    return Number.isSafeInteger(v) && v >= 0 ? v : null;
  }
  const t = String(v ?? '').replace(/\s/g, '');
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}

/** Bir martalik kod/tokenning SHA-256 xeshi (bazada ochiq saqlamaslik uchun) */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Kriptografik tasodifiy N xonali raqamli kod */
export function randomNumericCode(len = 6): string {
  let s = '';
  for (let i = 0; i < len; i++) s += crypto.randomInt(0, 10);
  return s;
}

/** HMAC-SHA256 imzo (base64url, qisqartirilgan) */
export function hmacSign(data: string, secret: string, len = 16): string {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url').slice(0, len);
}

/**
 * Do'kon Telegram'ini ulash uchun qisqa muddatli imzolangan token.
 * Format: `<orgId>_<expBase36>_<sig>` (Telegram start param: ≤64 belgi, [A-Za-z0-9_-]).
 */
export function createOrgLinkToken(orgId: string, secret: string, ttlSec = 60 * 60, now = Date.now()): string {
  const exp = Math.floor(now / 1000 + ttlSec).toString(36);
  return `${orgId}_${exp}_${hmacSign(`orglink:${orgId}:${exp}`, secret)}`;
}

/** Tokenni tekshiradi — muvaffaqiyatda orgId, aks holda null */
export function verifyOrgLinkToken(token: string, secret: string, now = Date.now()): string | null {
  const m = /^([a-f0-9]{24})_([a-z0-9]{1,10})_([A-Za-z0-9_-]{16})$/.exec(token || '');
  if (!m) return null;
  const [, orgId, exp, sig] = m;
  if (!safeEqual(sig, hmacSign(`orglink:${orgId}:${exp}`, secret))) return null;
  if (parseInt(exp, 36) * 1000 < now) return null;
  return orgId;
}

/**
 * Cron so'rovi ruxsati: `Authorization: Bearer <CRON_SECRET>` (doimiy vaqtli solishtirish).
 * `?secret=` query faqat production'dan tashqarida (URL loglarda/tarixda qoladi).
 */
export function cronSecretOk(
  authHeader: string | null,
  querySecret: string | null,
  expected: string | undefined,
  isProduction: boolean
): boolean {
  if (!expected) return false;
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (bearer) return safeEqual(bearer, expected);
  if (!isProduction && querySecret) return safeEqual(querySecret, expected);
  return false;
}

/** Fayl boshidagi "magic bytes" bo'yicha rasm turi (jpeg/png/webp), aks holda null */
export function detectImageType(buf: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'image/png';
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return 'image/webp';
  return null;
}
