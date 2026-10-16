import { describe, it, expect } from 'vitest';
import { tgEscape } from '@/lib/telegram';
import { isValidTrackId } from '@/lib/visitAnalytics';
import { siteVisitSchema } from '@/lib/models/master/SiteVisit';
import { loginRateKeys } from '@/lib/security';

describe('tgEscape — Telegram HTML ekranlash', () => {
  it('foydalanuvchi matnidagi teglar zararsizlanadi', () => {
    expect(tgEscape('<a href="x">Do\'kon</a> & Co')).toBe('&lt;a href="x"&gt;Do\'kon&lt;/a&gt; &amp; Co');
  });
  it('null/undefined bo\'sh satr', () => {
    expect(tgEscape(null)).toBe('');
    expect(tgEscape(undefined)).toBe('');
  });
});

describe('isValidTrackId — analytics identifikatorlari', () => {
  it('ruxsat etilgan belgilar, ≤64', () => {
    expect(isValidTrackId('abc_DEF-123')).toBe(true);
    expect(isValidTrackId('a'.repeat(64))).toBe(true);
  });
  it('uzun, bo\'sh yoki begona belgili id rad etiladi', () => {
    expect(isValidTrackId('a'.repeat(65))).toBe(false);
    expect(isValidTrackId('')).toBe(false);
    expect(isValidTrackId('abc def')).toBe(false);
    expect(isValidTrackId('abc<script>')).toBe(false);
    expect(isValidTrackId('{"$gt":""}')).toBe(false);
  });
});

describe('SiteVisit — TTL indeks', () => {
  it('startedAt bo\'yicha 90 kunlik expireAfterSeconds mavjud', () => {
    const idx = siteVisitSchema.indexes().find(([fields]) => (fields as Record<string, unknown>).startedAt === 1 && !('sessionId' in (fields as object)));
    const ttl = idx?.find((i) => typeof i === 'object' && 'expireAfterSeconds' in (i as object)) as { expireAfterSeconds?: number } | undefined;
    expect(ttl?.expireAfterSeconds).toBe(90 * 24 * 60 * 60);
  });
});

describe('loginRateKeys — Mini App scope', () => {
  it('tglogin IP kaliti slug\'ga bog\'liq emas', () => {
    expect(loginRateKeys('User', '1.2.3.4', 'tglogin').ip).toBe('tglogin-ip:1.2.3.4');
    expect(loginRateKeys('User', '1.2.3.4', 'tglogin').user).toBe('tglogin:user');
  });
});
