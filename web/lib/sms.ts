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

/** Bitta SMS yuboradi. Muvaffaqiyatda true. */
export async function sendSms(phone: string, message: string): Promise<boolean> {
  if (!isConfigured()) return false;
  const token = await getToken();
  if (!token) return false;

  const mobile = normalizePhone(phone);
  if (mobile.length < 12) return false;

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
