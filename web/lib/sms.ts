/**
 * SMS yuborish — Eskiz.uz (O'zbekiston uchun keng tarqalgan provayder).
 * Sozlash (.env): ESKIZ_EMAIL, ESKIZ_PASSWORD, ESKIZ_FROM (ixtiyoriy, standart "4546").
 * Kalitlar bo'lmasa — jimgina no-op (false qaytaradi), tizim ishlashda davom etadi.
 */

const ESKIZ_BASE = 'https://notify.eskiz.uz/api';

interface TokenCache {
  token: string | null;
  expires: number; // ms
}
const g = global as unknown as { _eskizToken?: TokenCache };
const cache: TokenCache = g._eskizToken ?? { token: null, expires: 0 };
g._eskizToken = cache;

function isConfigured(): boolean {
  return !!(process.env.ESKIZ_EMAIL && process.env.ESKIZ_PASSWORD);
}

async function getToken(): Promise<string | null> {
  if (cache.token && cache.expires > Date.now()) return cache.token;
  if (!isConfigured()) return null;
  try {
    const body = new URLSearchParams({
      email: process.env.ESKIZ_EMAIL!,
      password: process.env.ESKIZ_PASSWORD!,
    });
    const res = await fetch(`${ESKIZ_BASE}/auth/login`, { method: 'POST', body });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const token = data?.data?.token as string | undefined;
    if (!token) return null;
    cache.token = token;
    cache.expires = Date.now() + 25 * 24 * 60 * 60 * 1000; // ~25 kun
    return token;
  } catch {
    return null;
  }
}

/** Telefon raqamini 998XXXXXXXXX ko'rinishiga keltiradi. */
export function normalizePhone(phone: string): string {
  const d = (phone || '').replace(/\D/g, '');
  if (d.length === 9) return `998${d}`;         // XXXXXXXXX
  if (d.length === 12 && d.startsWith('998')) return d;
  if (d.length === 13 && d.startsWith('998')) return d.slice(0, 12);
  return d;
}

/**
 * Faqat O'zbekiston mobil raqami (998 + 9 raqam). Xorijiy/qisqa/uzun raqamlarga
 * SMS yuborilmaydi — provayder hisobini chet el raqamlariga sarflashning oldi olinadi.
 */
export function isValidUzPhone(normalized: string): boolean {
  return /^998\d{9}$/.test(normalized);
}

/**
 * Do'kon nomi kabi foydalanuvchi kiritgan matnni SMS'ga qo'shishdan oldin tozalaydi:
 * havolalar olib tashlanadi (spam/fishing), yangi qatorlar bo'sh joyga aylanadi,
 * uzunlik `max` belgi bilan cheklanadi.
 */
export function smsSafeText(v: unknown, max = 40): string {
  return String(v ?? '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max);
}

/** Bitta SMS yuboradi. Muvaffaqiyatda true. */
export async function sendSms(phone: string, message: string): Promise<boolean> {
  if (!isConfigured()) return false;

  const mobile = normalizePhone(phone);
  if (!isValidUzPhone(mobile)) return false;

  const token = await getToken();
  if (!token) return false;

  try {
    const body = new URLSearchParams({
      mobile_phone: mobile,
      message,
      from: process.env.ESKIZ_FROM || '4546',
    });
    const res = await fetch(`${ESKIZ_BASE}/message/sms/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    if (res.status === 401) {
      // token eskirgan — bir marta yangilab qayta urinamiz
      cache.token = null;
      cache.expires = 0;
      const t2 = await getToken();
      if (!t2) return false;
      const res2 = await fetch(`${ESKIZ_BASE}/message/sms/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t2}` },
        body,
      });
      return res2.ok;
    }
    return res.ok;
  } catch {
    return false;
  }
}

export function isSmsConfigured(): boolean {
  return isConfigured();
}
