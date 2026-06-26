import crypto from 'crypto';

export interface TelegramWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

/**
 * Telegram Mini App `initData` ni tekshiradi (rasmiy algoritm).
 * secret = HMAC-SHA256("WebAppData", bot_token); so'ng data-check-string'ni
 * shu secret bilan imzolab, kelgan `hash` bilan solishtiramiz.
 * Muvaffaqiyatda foydalanuvchini qaytaradi, aks holda null.
 *
 * @param maxAgeSec auth_date eskirgan bo'lsa rad etiladi (standart 24 soat)
 */
export function validateInitData(
  initData: string,
  botToken: string,
  maxAgeSec = 60 * 60 * 24
): TelegramWebAppUser | null {
  if (!initData || !botToken) return null;

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return null;
  }

  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  // Doimiy vaqtli solishtirish (timing attack'dan himoya)
  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;

  const userJson = params.get('user');
  if (!userJson) return null;
  try {
    const user = JSON.parse(userJson) as TelegramWebAppUser;
    if (!user || typeof user.id !== 'number') return null;
    return user;
  } catch {
    return null;
  }
}

/** 8 belgili bog'lash kodi (deep link uchun) */
export function generateLinkCode(): string {
  return crypto.randomBytes(6).toString('base64url').slice(0, 8);
}
