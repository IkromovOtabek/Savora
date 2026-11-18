/**
 * Restoranning ochiq ma'lumoti (mijoz sahifasi /m/<slug>, kirish eshigi QR plakati) — sof funksiyalar
 * (DB yo'q, client'da ham ishlaydi: admin formasi shu qoidalar bilan oldindan tekshiradi, server — saqlashdan oldin).
 *
 * Kiritish erkin: Instagram/Telegram — login, «@login» yoki to'liq havola; telefon — har qanday ko'rinishda
 * (O'zbekiston raqami «+998 90 123 45 67» ga keltiriladi, xorijiy — «+» bilan, qisqa raqam — 3–5 raqam).
 */
import { canonicalPhone, uzLocalDigits } from '../phone';
import type { RestaurantInfo } from './types';

export const INFO_LIMITS = { about: 300, address: 160, phone: 24, workHours: 80 } as const;

export type InfoField = 'about' | 'address' | 'phone' | 'workHours' | 'instagram' | 'telegram';

const IG_RE = /^[A-Za-z0-9._]{1,30}$/;
const TG_RE = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;
/** Profil emas, xizmat yo'llari: instagram.com/p/…, t.me/joinchat/… */
const IG_RESERVED = new Set(['p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'tv', 'direct']);
const TG_RESERVED = new Set(['joinchat', 'addstickers', 'addemoji', 'share', 'proxy', 'socks', 'iv', 'login']);
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Bitta qatorli matn: boshqaruv belgilari olib tashlanadi, bo'sh joylar bittaga */
function oneLine(v: string): string {
  return v.replace(CONTROL_RE, '').replace(/\s+/g, ' ').trim();
}

/** Ko'p qatorli (tavsif): ketma-ket bo'sh qatorlar ikkitadan oshmaydi */
function multiLine(v: string): string {
  return v
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_RE, '')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** «@login», «login», «https://instagram.com/login/?igsh=…» → «login». Bo'sh — ''; noto'g'ri — null */
export function parseInstagram(raw: string): string | null {
  let v = raw.trim();
  if (!v) return '';
  const m = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:instagram\.com|instagr\.am)\/([^/?#]+)/i.exec(v);
  if (m) v = m[1];
  else if (/[/:]/.test(v)) return null;
  v = v.replace(/^@/, '');
  if (!IG_RE.test(v) || v.startsWith('.') || v.endsWith('.') || v.includes('..')) return null;
  v = v.toLowerCase();
  return IG_RESERVED.has(v) ? null : v;
}

/** «@login», «login», «https://t.me/login» → «login» (5–32 belgi, harf bilan boshlanadi). Bo'sh — ''; noto'g'ri — null */
export function parseTelegram(raw: string): string | null {
  let v = raw.trim();
  if (!v) return '';
  const m = /^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog)\/([^/?#]+)/i.exec(v);
  if (m) v = m[1];
  else if (/[/:]/.test(v)) return null;
  v = v.replace(/^@/, '');
  if (!TG_RE.test(v)) return null;
  return TG_RESERVED.has(v.toLowerCase()) ? null : v;
}

/**
 * Telefon: O'zbekiston raqami (9 mahalliy raqam, +998 bilan yoki siz) — «+998 90 123 45 67»;
 * xorijiy — «+» va 8–15 raqam; qisqa xizmat raqami — 3–5 raqam («1170»). Bo'sh — ''; noto'g'ri — null.
 */
export function parsePhone(raw: string): string | null {
  const v = oneLine(raw);
  if (!v) return '';
  if (v.length > INFO_LIMITS.phone || !/^\+?[\d\s().-]+$/.test(v)) return null;
  const digits = v.replace(/\D/g, '');
  const plus = v.startsWith('+');
  const uz = plus ? digits.startsWith('998') : digits.length === 9 || (digits.startsWith('998') && digits.length > 9);
  if (uz) {
    // Faqat to'liq raqam (9 mahalliy raqam); yarim yozilgan «+998 90 12» — rad
    const parts = uzLocalDigits(v);
    return parts && parts.local.length === 9 ? canonicalPhone(v) : null;
  }
  if (plus) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  return digits.length >= 3 && digits.length <= 5 ? digits : null;
}

/** tel: havolasi */
export function telHref(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `tel:${phone.trim().startsWith('+') ? '+' : ''}${digits}`;
}

export function instagramUrl(handle: string): string {
  return `https://www.instagram.com/${encodeURIComponent(handle)}/`;
}

export function telegramUrl(handle: string): string {
  return `https://t.me/${encodeURIComponent(handle)}`;
}

/** Kiritish (server action / API): undefined — o'zgarmaydi, null yoki '' — o'chiriladi */
export type RestaurantInfoInput = Partial<Record<InfoField, string | null>> & { takeawayByPhone?: boolean | null };

/**
 * Joriy ma'lumot + kiritish → yangi ma'lumot (faqat to'ldirilgan maydonlar). Noto'g'ri maydon — `field`
 * (admin formasi shu maydonni belgilaydi).
 */
export function normalizeRestaurantInfo(
  cur: RestaurantInfo,
  input: RestaurantInfoInput,
): { ok: true; info: RestaurantInfo } | { ok: false; field: InfoField } {
  const next: RestaurantInfo = { ...cur };
  const put = (k: InfoField, v: string) => {
    if (v) next[k] = v;
    else delete next[k];
  };

  const text: [InfoField, (s: string) => string, number][] = [
    ['about', multiLine, INFO_LIMITS.about],
    ['address', oneLine, INFO_LIMITS.address],
    ['workHours', oneLine, INFO_LIMITS.workHours],
  ];
  for (const [k, clean, max] of text) {
    const raw = input[k];
    if (raw === undefined) continue;
    const v = clean(raw ?? '');
    if (v.length > max) return { ok: false, field: k };
    put(k, v);
  }

  const parsed: [InfoField, (s: string) => string | null][] = [
    ['phone', parsePhone],
    ['instagram', parseInstagram],
    ['telegram', parseTelegram],
  ];
  for (const [k, parse] of parsed) {
    const raw = input[k];
    if (raw === undefined) continue;
    const v = parse(raw ?? '');
    if (v === null) return { ok: false, field: k };
    put(k, v);
  }

  if (input.takeawayByPhone !== undefined) {
    if (input.takeawayByPhone) next.takeawayByPhone = true;
    else delete next.takeawayByPhone;
  }
  return { ok: true, info: next };
}

/** Mijoz sahifasiga chiqadigan ko'rinish (yo'q maydon — null). Saboy telefoni — faqat raqam bo'lsa */
export interface PublicRestaurantInfo {
  about: string | null;
  address: string | null;
  phone: string | null;
  workHours: string | null;
  instagram: string | null;
  telegram: string | null;
  /** Telefon orqali olib ketish buyurtmasi qabul qilinadi (raqam — `phone`) */
  takeawayByPhone: boolean;
}

export function toPublicInfo(info: RestaurantInfo | undefined): PublicRestaurantInfo {
  const i = info ?? {};
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const phone = s(i.phone);
  return {
    about: s(i.about),
    address: s(i.address),
    phone,
    workHours: s(i.workHours),
    instagram: s(i.instagram),
    telegram: s(i.telegram),
    takeawayByPhone: !!(i.takeawayByPhone && phone),
  };
}
