import { describe, it, expect, vi, afterEach } from 'vitest';
import { validateEnv, assertEnv, formatEnvReport } from '@/lib/env';

const GOOD = {
  NODE_ENV: 'production',
  MONGO_URI: 'mongodb://mongo:27017',
  MASTER_DB_NAME: 'savora',
  SESSION_SECRET: 'a'.repeat(48),
  ROOT_DOMAIN: 'savora.uz',
  NEXT_PUBLIC_ROOT_DOMAIN: 'savora.uz',
  NEXT_PUBLIC_APP_URL: 'https://savora.uz',
  NEXT_PUBLIC_USE_PATH_ROUTING: 'true',
  CRON_SECRET: 'c'.repeat(64),
  R2_ACCOUNT_ID: 'acc',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'sec',
  R2_BUCKET: 'savora-uploads',
  R2_PUBLIC_URL: 'https://cdn.savora.uz',
};

describe('validateEnv (production)', () => {
  it("to'g'ri sozlama — xato ham, ogohlantirish ham yo'q", () => {
    const r = validateEnv(GOOD);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('majburiy qiymatlar yo\'q — har biri uchun aniq xato', () => {
    const r = validateEnv({ NODE_ENV: 'production' });
    const all = r.errors.join('\n');
    for (const key of ['MONGO_URI', 'SESSION_SECRET', 'ROOT_DOMAIN', 'NEXT_PUBLIC_APP_URL', 'CRON_SECRET']) {
      expect(all).toContain(key);
    }
  });

  it('SESSION_SECRET 32 belgidan qisqa — xato', () => {
    const r = validateEnv({ ...GOOD, SESSION_SECRET: 'x'.repeat(31) });
    expect(r.errors.some((e) => e.includes('SESSION_SECRET') && e.includes('31'))).toBe(true);
  });

  it('SESSION_SECRET aynan 32 belgi — qabul', () => {
    expect(validateEnv({ ...GOOD, SESSION_SECRET: 'x'.repeat(32) }).errors).toEqual([]);
  });

  it('.env.example dagi namunaviy SESSION_SECRET — xato', () => {
    const r = validateEnv({ ...GOOD, SESSION_SECRET: 'savdopro-super-secret-change-this-32chars' });
    expect(r.errors.some((e) => e.includes('namunaviy'))).toBe(true);
  });

  it('noto\'g\'ri MONGO_URI sxemasi — xato', () => {
    expect(validateEnv({ ...GOOD, MONGO_URI: 'http://db' }).errors.join()).toContain('MONGO_URI');
    expect(validateEnv({ ...GOOD, MONGO_URI: 'mongodb+srv://u:p@c.x.net' }).errors).toEqual([]);
  });

  it('ROOT_DOMAIN protokol bilan — xato; lvh.me — ogohlantirish', () => {
    expect(validateEnv({ ...GOOD, ROOT_DOMAIN: 'https://savora.uz' }).errors.join()).toContain('ROOT_DOMAIN');
    const r = validateEnv({ ...GOOD, ROOT_DOMAIN: 'lvh.me', NEXT_PUBLIC_ROOT_DOMAIN: 'lvh.me' });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join()).toContain('lvh.me');
  });

  it('NEXT_PUBLIC_APP_URL noto\'g\'ri — xato; http — ogohlantirish', () => {
    expect(validateEnv({ ...GOOD, NEXT_PUBLIC_APP_URL: 'savora.uz' }).errors.join()).toContain('NEXT_PUBLIC_APP_URL');
    const r = validateEnv({ ...GOOD, NEXT_PUBLIC_APP_URL: 'http://savora.uz' });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join()).toContain('https');
  });

  it('CRON_SECRET qisqa yoki namunaviy — xato', () => {
    expect(validateEnv({ ...GOOD, CRON_SECRET: 'short' }).errors.join()).toContain('CRON_SECRET');
    expect(validateEnv({ ...GOOD, CRON_SECRET: 'your-cron-secret-here' }).errors.join()).toContain('namunaviy');
  });

  it('TELEGRAM_BOT_TOKEN bor, TELEGRAM_WEBHOOK_SECRET yo\'q — xato', () => {
    const r = validateEnv({ ...GOOD, TELEGRAM_BOT_TOKEN: '123:abc', TELEGRAM_BOT_USERNAME: 'savora_bot' });
    expect(r.errors.some((e) => e.includes('TELEGRAM_WEBHOOK_SECRET'))).toBe(true);
  });

  it('TELEGRAM_WEBHOOK_SECRET ruxsat etilmagan belgilar bilan — xato', () => {
    const r = validateEnv({
      ...GOOD,
      TELEGRAM_BOT_TOKEN: '123:abc',
      TELEGRAM_BOT_USERNAME: 'savora_bot',
      TELEGRAM_WEBHOOK_SECRET: 'has space!',
    });
    expect(r.errors.join()).toContain('TELEGRAM_WEBHOOK_SECRET');
  });

  it('Telegram to\'liq sozlangan — xato yo\'q', () => {
    const r = validateEnv({
      ...GOOD,
      TELEGRAM_BOT_TOKEN: '123:abc',
      TELEGRAM_BOT_USERNAME: 'savora_bot',
      TELEGRAM_WEBHOOK_SECRET: 'a1b2_c3-D4',
    });
    expect(r.errors).toEqual([]);
  });

  it('Telegram token yo\'q — webhook secret talab qilinmaydi', () => {
    expect(validateEnv(GOOD).errors).toEqual([]);
  });

  it('R2 qisman sozlangan — ogohlantirish (xato emas)', () => {
    const r = validateEnv({ ...GOOD, R2_PUBLIC_URL: '' });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join()).toContain('R2_PUBLIC_URL');
  });

  it('xabarlarda sir qiymatlari chiqmaydi', () => {
    const secret = 'super-secret-value-that-must-not-leak';
    const r = validateEnv({ ...GOOD, SESSION_SECRET: secret.slice(0, 20), CRON_SECRET: 'abc' });
    const text = formatEnvReport(r);
    expect(text).not.toContain(secret.slice(0, 20));
    expect(text).not.toContain('abc"');
  });
});

describe('validateEnv (dev)', () => {
  it('dev rejimida xatolar ogohlantirishga aylanadi (server to\'xtamaydi)', () => {
    const r = validateEnv({ NODE_ENV: 'development' });
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe('assertEnv', () => {
  afterEach(() => vi.restoreAllMocks());

  it('production + xato — Error tashlaydi (o\'zbekcha xabar bilan)', () => {
    expect(() => assertEnv({ NODE_ENV: 'production' })).toThrow(/server ishga tushirilmadi/);
  });

  it('build bosqichida tekshirmaydi', () => {
    expect(() => assertEnv({ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' })).not.toThrow();
  });

  it('to\'g\'ri sozlama — tashlamaydi', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => assertEnv(GOOD)).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });
});
