import { describe, it, expect } from 'vitest';
import {
  safeEqual,
  escapeRegExp,
  searchPattern,
  csvCell,
  clientIpFrom,
  loginRateKeys,
  parseIntegerSum,
  createOrgLinkToken,
  verifyOrgLinkToken,
  cronSecretOk,
  detectImageType,
} from '@/lib/security';
import { addMonthsClamped } from '@/lib/dates';
import { parsePrice } from '@/lib/format';

const hdr = (m: Record<string, string>) => ({ get: (k: string) => m[k.toLowerCase()] ?? null });

describe('safeEqual — doimiy vaqtli solishtirish', () => {
  it('teng satrlar', () => expect(safeEqual('abc123', 'abc123')).toBe(true));
  it('farqli satrlar / uzunliklar', () => {
    expect(safeEqual('abc123', 'abc124')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
  it("bo'sh yoki null hech qachon mos emas", () => {
    expect(safeEqual('', '')).toBe(false);
    expect(safeEqual(null, 'x')).toBe(false);
    expect(safeEqual('x', undefined)).toBe(false);
  });
});

describe('escapeRegExp / searchPattern', () => {
  it('maxsus belgilar ekranlanadi', () => {
    expect(escapeRegExp('a.b*c(d)')).toBe('a\\.b\\*c\\(d\\)');
    expect(new RegExp(escapeRegExp('(a+)+$')).test('(a+)+$')).toBe(true);
  });
  it('50 belgigacha kesiladi', () => {
    expect(searchPattern('x'.repeat(80)).length).toBe(50);
    expect(searchPattern('  iphone  ')).toBe('iphone');
    expect(searchPattern(null)).toBe('');
  });
});

describe('csvCell — formula injection himoyasi', () => {
  it('= + - @ bilan boshlangan qiymat prefikslanadi', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+998')).toBe(`"'+998"`);
    expect(csvCell('-1')).toBe(`"'-1"`);
    expect(csvCell('@SUM(A1)')).toBe(`"'@SUM(A1)"`);
  });
  it('oddiy qiymat va sonlar', () => {
    expect(csvCell('Telefon, qora')).toBe('"Telefon, qora"');
    expect(csvCell(150000)).toBe('"150000"');
    expect(csvCell(null)).toBe('""');
  });
});

describe('clientIpFrom / loginRateKeys', () => {
  it('x-forwarded-for birinchi bo\'g\'ini', () => {
    expect(clientIpFrom(hdr({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))).toBe('1.2.3.4');
    expect(clientIpFrom(hdr({ 'x-real-ip': '5.6.7.8' }))).toBe('5.6.7.8');
    expect(clientIpFrom(hdr({}))).toBe('unknown');
  });
  it('kalit slug/zonaga bog\'liq emas', () => {
    const k = loginRateKeys('  Ali ', '1.2.3.4');
    expect(k.user).toBe('login:ali');
    expect(k.ip).toBe('login-ip:1.2.3.4');
    expect(loginRateKeys('ali', 'x', 'reset').user).toBe('reset:ali');
  });
});

describe("parseIntegerSum / parsePrice — butun so'm", () => {
  it('butun sonlar qabul qilinadi', () => {
    expect(parseIntegerSum('1 500 000')).toBe(1500000);
    expect(parseIntegerSum(250)).toBe(250);
    expect(parsePrice('1 000')).toBe(1000);
  });
  it('kasr, manfiy, matn rad etiladi', () => {
    expect(parseIntegerSum('10.5')).toBeNull();
    expect(parseIntegerSum(10.5)).toBeNull();
    expect(parseIntegerSum(-1)).toBeNull();
    expect(parseIntegerSum('abc')).toBeNull();
    expect(parsePrice('99.99')).toBeNull();
    expect(parsePrice('-5')).toBeNull();
  });
});

describe('Telegram do\'kon ulash tokeni', () => {
  const secret = 'test-secret-test-secret-test-secret-32';
  const orgId = '65a1b2c3d4e5f60718293a4b';
  it('yaratilgan token tekshiruvdan o\'tadi va ≤64 belgi', () => {
    const t = createOrgLinkToken(orgId, secret);
    expect(`link_${t}`.length).toBeLessThanOrEqual(64);
    expect(/^[A-Za-z0-9_-]+$/.test(t)).toBe(true);
    expect(verifyOrgLinkToken(t, secret)).toBe(orgId);
  });
  it('soxta / eskirgan / boshqa kalit — rad', () => {
    const t = createOrgLinkToken(orgId, secret);
    expect(verifyOrgLinkToken(t, 'other-secret')).toBeNull();
    expect(verifyOrgLinkToken(orgId, secret)).toBeNull(); // eski format: faqat orgId
    const other = '75a1b2c3d4e5f60718293a4b';
    expect(verifyOrgLinkToken(t.replace(orgId, other), secret)).toBeNull();
    const old = createOrgLinkToken(orgId, secret, 60, Date.now() - 2 * 60 * 60 * 1000);
    expect(verifyOrgLinkToken(old, secret)).toBeNull();
  });
});

describe('cronSecretOk', () => {
  it('Bearer sarlavha', () => {
    expect(cronSecretOk('Bearer s3cret', null, 's3cret', true)).toBe(true);
    expect(cronSecretOk('Bearer wrong', null, 's3cret', true)).toBe(false);
  });
  it("query faqat dev'da", () => {
    expect(cronSecretOk(null, 's3cret', 's3cret', true)).toBe(false);
    expect(cronSecretOk(null, 's3cret', 's3cret', false)).toBe(true);
  });
  it("CRON_SECRET yo'q — har doim rad", () => {
    expect(cronSecretOk('Bearer ', null, undefined, false)).toBe(false);
  });
});

describe('detectImageType — magic bytes', () => {
  it('jpeg / png / webp', () => {
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(detectImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe('image/webp');
  });
  it('boshqa fayl (html/svg) — null', () => {
    expect(detectImageType(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
  });
});

describe('addMonthsClamped — oy oxiri', () => {
  it('31-yanvar + 1 oy → fevral oxiri', () => {
    const d = addMonthsClamped(new Date(2026, 0, 31), 1);
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 1, 28]);
    const leap = addMonthsClamped(new Date(2028, 0, 31), 1);
    expect(leap.getDate()).toBe(29);
  });
  it('oddiy holat va yil o\'tishi', () => {
    const d = addMonthsClamped(new Date(2026, 10, 15), 3);
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2027, 1, 15]);
    const e = addMonthsClamped(new Date(2026, 2, 31), 1);
    expect([e.getMonth(), e.getDate()]).toEqual([3, 30]);
  });
});
