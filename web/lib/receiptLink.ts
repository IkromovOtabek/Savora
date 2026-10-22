import crypto from 'crypto';
import { hmacSign, safeEqual } from './security';

/**
 * Ochiq chek havolasi (mijozga ulashish uchun, login talab qilmaydi): /r/<orgId>.<checkoutId>.<imzo>
 * checkoutId — tasodifiy 72 bit, imzo — SESSION_SECRET bilan HMAC. Havolani bilmagan odam chekni topa olmaydi.
 */
const SECRET = process.env.SESSION_SECRET || 'dev-only-session-secret-change-in-prod-32ch';

/** Yangi xarid kaliti (12 belgi, base64url) */
export function newCheckoutId(): string {
  return crypto.randomBytes(9).toString('base64url');
}

export function receiptToken(orgId: string, checkoutId: string, secret = SECRET): string {
  return `${orgId}.${checkoutId}.${hmacSign(`receipt:${orgId}:${checkoutId}`, secret)}`;
}

export function receiptPath(orgId: string, checkoutId: string): string {
  return `/r/${receiptToken(orgId, checkoutId)}`;
}

/** Imzo to'g'ri bo'lsa — { orgId, checkoutId }, aks holda null */
export function parseReceiptToken(token: string, secret = SECRET): { orgId: string; checkoutId: string } | null {
  const m = /^([a-f0-9]{24})\.([A-Za-z0-9_-]{8,32})\.([A-Za-z0-9_-]{16})$/.exec(token || '');
  if (!m) return null;
  const [, orgId, checkoutId, sig] = m;
  if (!safeEqual(sig, hmacSign(`receipt:${orgId}:${checkoutId}`, secret))) return null;
  return { orgId, checkoutId };
}
