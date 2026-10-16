import { describe, it, expect } from 'vitest';
import {
  formatBytes, formatDuration, timeAgo, percent, securityPosture, postureSummary, cronState,
  summarizeEvents, attackSuspects, overallStatus, type EventLite,
} from '@/lib/monitorChecks';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-16T10:00:00Z').getTime();

const PROD_ENV = {
  NODE_ENV: 'production',
  MONGO_URI: 'mongodb://savora:pw@mongo:27017',
  MASTER_DB_NAME: 'savdopro_master',
  SESSION_SECRET: 'x'.repeat(64),
  ROOT_DOMAIN: 'savora.uz',
  NEXT_PUBLIC_ROOT_DOMAIN: 'savora.uz',
  NEXT_PUBLIC_APP_URL: 'https://savora.uz',
  CRON_SECRET: 'c'.repeat(64),
  TELEGRAM_BOT_TOKEN: '123:abc',
  TELEGRAM_WEBHOOK_SECRET: 's'.repeat(32),
  TELEGRAM_BOT_USERNAME: 'savora_bot',
  R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'b', R2_SECRET_ACCESS_KEY: 'c', R2_BUCKET: 'd', R2_PUBLIC_URL: 'https://cdn.savora.uz',
  ERROR_WEBHOOK_URL: 'https://hooks.example.com/x',
  CSP_MODE: 'enforce',
  BACKUP_DIR: '/var/backups/savora',
};

const basePosture = {
  env: PROD_ENV,
  superAdmins: [{ username: 'admin', passwordUpdatedAt: new Date(NOW - 10 * DAY) }],
  lastBackupAt: new Date(NOW - 6 * 60 * 60 * 1000),
  backupDirExists: true,
  mongoAuth: true,
  mongoVersion: '7.0.5',
  nodeMajor: 20,
  now: NOW,
};

describe('formatlash', () => {
  it('formatBytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe('5 GB');
    expect(formatBytes(null)).toBe('—');
  });
  it('formatDuration', () => {
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(3 * 60 + 5)).toBe('3 daq 5 s');
    expect(formatDuration(2 * 3600 + 60)).toBe('2 soat 1 daq');
    expect(formatDuration(3 * 86400 + 7200)).toBe('3 kun 2 soat');
  });
  it('timeAgo', () => {
    expect(timeAgo(null)).toBe('hech qachon');
    expect(timeAgo(new Date(NOW - 10_000), NOW)).toBe('hozirgina');
    expect(timeAgo(new Date(NOW - 5 * 60_000), NOW)).toBe('5 daq oldin');
    expect(timeAgo(new Date(NOW - 3 * 3600_000), NOW)).toBe('3 soat oldin');
    expect(timeAgo(new Date(NOW - 2 * DAY), NOW)).toBe('2 kun oldin');
  });
  it('percent chegaralangan', () => {
    expect(percent(50, 200)).toBe(25);
    expect(percent(5, 0)).toBe(0);
    expect(percent(300, 100)).toBe(100);
  });
});

describe('securityPosture — to\'liq sozlangan production', () => {
  it('jiddiy xato yo\'q', () => {
    const checks = securityPosture(basePosture);
    const s = postureSummary(checks);
    expect(s.bad).toBe(0);
    expect(s.status).toBe('ok');
    expect(checks.find((c) => c.key === 'https')?.status).toBe('ok');
    expect(checks.find((c) => c.key === 'backup')?.status).toBe('ok');
    expect(checks.find((c) => c.key === 'mongo-auth')?.status).toBe('ok');
  });
  it('sir qiymatlari matnga chiqmaydi', () => {
    const text = JSON.stringify(securityPosture(basePosture));
    expect(text).not.toContain('x'.repeat(32));
    expect(text).not.toContain('c'.repeat(32));
    expect(text).not.toContain('123:abc');
    expect(text).not.toContain('savora:pw');
  });
});

describe('securityPosture — kamchiliklar', () => {
  it('http + CSP off + qisqa sessiya kaliti → bad', () => {
    const checks = securityPosture({ ...basePosture, env: { ...PROD_ENV, NEXT_PUBLIC_APP_URL: 'http://savora.uz', CSP_MODE: 'off', SESSION_SECRET: 'short' } });
    expect(checks.find((c) => c.key === 'https')?.status).toBe('bad');
    expect(checks.find((c) => c.key === 'csp')?.status).toBe('bad');
    expect(checks.find((c) => c.key === 'session')?.status).toBe('bad');
    expect(postureSummary(checks).status).toBe('bad');
  });
  it('zaxira eskirgan → warn/bad; papka yo\'q → bad', () => {
    expect(securityPosture({ ...basePosture, lastBackupAt: new Date(NOW - 2 * DAY) }).find((c) => c.key === 'backup')?.status).toBe('warn');
    expect(securityPosture({ ...basePosture, lastBackupAt: new Date(NOW - 5 * DAY) }).find((c) => c.key === 'backup')?.status).toBe('bad');
    expect(securityPosture({ ...basePosture, backupDirExists: false, lastBackupAt: null }).find((c) => c.key === 'backup')?.status).toBe('bad');
  });
  it('super admin paroli 6 oydan eski → warn, bir nechta admin → warn', () => {
    const checks = securityPosture({
      ...basePosture,
      superAdmins: [
        { username: 'admin', passwordUpdatedAt: new Date(NOW - 200 * DAY) },
        { username: 'ikkinchi', passwordUpdatedAt: new Date(NOW - DAY) },
      ],
    });
    expect(checks.find((c) => c.key === 'sa-admin')?.status).toBe('warn');
    expect(checks.find((c) => c.key === 'sa-ikkinchi')?.status).toBe('ok');
    expect(checks.find((c) => c.key === 'sa-count')?.status).toBe('warn');
  });
  it('MongoDB: auth\'siz lokal → warn, auth\'siz tashqi → bad', () => {
    const local = securityPosture({ ...basePosture, mongoAuth: false, env: { ...PROD_ENV, MONGO_URI: 'mongodb://mongo:27017' } });
    expect(local.find((c) => c.key === 'mongo-auth')?.status).toBe('warn');
    const remote = securityPosture({ ...basePosture, mongoAuth: false, env: { ...PROD_ENV, MONGO_URI: 'mongodb://1.2.3.4:27017' } });
    expect(remote.find((c) => c.key === 'mongo-auth')?.status).toBe('bad');
  });
  it('telegram token bor, secret yo\'q → bad (env xatosi ham)', () => {
    const checks = securityPosture({ ...basePosture, env: { ...PROD_ENV, TELEGRAM_WEBHOOK_SECRET: '' } });
    expect(checks.find((c) => c.key === 'tg-webhook')?.status).toBe('bad');
    expect(checks.some((c) => c.key === 'env-err')).toBe(true);
  });
  it('dev rejimida hech narsa bad emas (faqat ogohlantirish)', () => {
    const checks = securityPosture({ ...basePosture, env: { NODE_ENV: 'development', MONGO_URI: 'mongodb://127.0.0.1:27017' }, mongoAuth: null, lastBackupAt: null, backupDirExists: false });
    expect(checks.find((c) => c.key === 'env-err')).toBeUndefined();
    expect(checks.find((c) => c.key === 'node-env')?.status).toBe('warn');
  });
});

describe('cronState', () => {
  it('holatlar', () => {
    expect(cronState(null, NOW)).toBe('never');
    expect(cronState({ startedAt: new Date(NOW - 2 * 3600_000), ok: true }, NOW)).toBe('ok');
    expect(cronState({ startedAt: new Date(NOW - 30 * 3600_000), ok: true }, NOW)).toBe('late');
    expect(cronState({ startedAt: new Date(NOW - 3600_000), ok: false }, NOW)).toBe('failed');
  });
});

describe('summarizeEvents / attackSuspects', () => {
  const ev = (type: EventLite['type'], ip: string, username?: string): EventLite => ({ type, ip, username, at: new Date(NOW) });
  it('shubhali hodisalar IP bo\'yicha guruhlanadi, muvaffaqiyatli kirish hisobga olinmaydi', () => {
    const events: EventLite[] = [
      ...Array.from({ length: 25 }, (_, i) => ev('login_fail', '10.0.0.1', `user${i % 3}`)),
      ev('login_ok', '10.0.0.1', 'user0'),
      ev('login_fail', '10.0.0.2', 'admin'),
      ev('cron_forbidden', '10.0.0.3'),
    ];
    const s = summarizeEvents(events);
    expect(s.byType.login_fail).toBe(26);
    expect(s.byType.login_ok).toBe(1);
    expect(s.suspicious).toBe(27);
    expect(s.topIps[0]).toEqual({ ip: '10.0.0.1', count: 25, users: 3 });
    expect(s.topUsers[0].count).toBeGreaterThan(0);
    expect(attackSuspects(s.topIps)).toEqual(['10.0.0.1']);
  });
  it('unknown IP hujumchi deb belgilanmaydi', () => {
    expect(attackSuspects([{ ip: 'unknown', count: 100 }])).toEqual([]);
  });
});

describe('overallStatus', () => {
  const ok = { dbUp: true, posture: 'ok' as const, attackers: 0, errors24h: 0, diskUsedPct: 40, memUsedPct: 50 };
  it('hammasi joyida', () => expect(overallStatus(ok)).toEqual({ status: 'ok', reasons: [] }));
  it('DB yo\'q → bad', () => expect(overallStatus({ ...ok, dbUp: false }).status).toBe('bad'));
  it('disk 85% → warn, 95% → bad', () => {
    expect(overallStatus({ ...ok, diskUsedPct: 85 }).status).toBe('warn');
    expect(overallStatus({ ...ok, diskUsedPct: 95 }).status).toBe('bad');
  });
  it('warn bad\'ni pasaytirmaydi', () => {
    const r = overallStatus({ ...ok, attackers: 2, posture: 'warn' });
    expect(r.status).toBe('bad');
    expect(r.reasons.length).toBe(2);
  });
});
