/**
 * Monitoring — sof (I/O'siz) yordamchilar: formatlash, xavfsizlik auditi,
 * cron kechikishi, hodisalar xulosasi. Test: tests/monitorChecks.test.ts
 */
import { validateEnv } from './env';
import { CRON_JOBS, type CronJob } from './models/master/CronRun';
import type { SecurityEventType } from './models/master/SecurityEvent';

export type CheckStatus = 'ok' | 'warn' | 'bad' | 'info';

export interface Check {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
  /** Qanday tuzatish (qisqa) */
  fix?: string;
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const txt = v < 10 && i > 0 ? v.toFixed(1).replace(/\.0$/, '') : String(Math.round(v));
  return `${txt} ${units[i]}`;
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return '—';
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} kun ${h} soat`;
  if (h > 0) return `${h} soat ${m} daq`;
  if (m > 0) return `${m} daq ${s % 60} s`;
  return `${s} s`;
}

/** "3 daqiqa oldin" ko'rinishi */
export function timeAgo(date: Date | string | null | undefined, now = Date.now()): string {
  if (!date) return 'hech qachon';
  const t = new Date(date).getTime();
  if (!Number.isFinite(t)) return '—';
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'hozirgina';
  if (min < 60) return `${min} daq oldin`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} soat oldin`;
  const d = Math.floor(h / 24);
  return `${d} kun oldin`;
}

export function percent(part: number, total: number): number {
  if (!total || !Number.isFinite(part) || !Number.isFinite(total)) return 0;
  return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
}

// ── Xavfsizlik auditi ───────────────────────────────────────────────────
type Env = Record<string, string | undefined>;

export interface PostureInput {
  env: Env;
  superAdmins: { username: string; passwordUpdatedAt?: Date | null }[];
  /** Zaxira: oxirgi papka vaqti (null — topilmadi) */
  lastBackupAt: Date | null;
  backupDirExists: boolean;
  /** MongoDB auth yoqilganmi (serverStatus security / connection string'da user bor) */
  mongoAuth: boolean | null;
  mongoVersion?: string | null;
  nodeMajor: number;
  now?: number;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Loyiha xavfsizlik holati — IT mutaxassis bir qarashda ko'rishi kerak bo'lgan ro'yxat.
 * Sir qiymatlari hech qachon chiqarilmaydi, faqat "bor/yo'q/uzunligi".
 */
export function securityPosture(input: PostureInput): Check[] {
  const { env } = input;
  const now = input.now ?? Date.now();
  const prod = env.NODE_ENV === 'production';
  const v = (k: string) => (env[k] ?? '').trim();
  const out: Check[] = [];

  // Env umumiy tekshiruvi (lib/env.ts)
  const report = validateEnv(env, prod);
  for (const e of report.errors) out.push({ key: 'env-err', label: 'Muhit sozlamasi', status: 'bad', detail: e });
  for (const w of report.warnings) out.push({ key: 'env-warn', label: 'Muhit sozlamasi', status: 'warn', detail: w });

  out.push({
    key: 'node-env',
    label: 'Ish rejimi',
    status: prod ? 'ok' : 'warn',
    detail: prod ? 'production — xato tafsilotlari yashirin, cookie secure' : `NODE_ENV=${env.NODE_ENV || 'development'} — bu dev rejimi`,
    fix: prod ? undefined : "Serverda NODE_ENV=production bo'lishi shart.",
  });

  const appUrl = v('NEXT_PUBLIC_APP_URL');
  const https = appUrl.startsWith('https://');
  out.push({
    key: 'https',
    label: 'HTTPS',
    status: https ? 'ok' : prod ? 'bad' : 'info',
    detail: https ? 'Sayt https orqali, HSTS yoqilgan (1 yil)' : `Sayt manzili https emas (${appUrl || "o'rnatilmagan"})`,
    fix: https ? undefined : "nginx + certbot bilan SSL o'rnating; NEXT_PUBLIC_APP_URL=https://...",
  });

  const csp = v('CSP_MODE') || 'enforce';
  out.push({
    key: 'csp',
    label: 'Content-Security-Policy',
    status: csp === 'enforce' ? 'ok' : csp === 'report-only' ? 'warn' : 'bad',
    detail: csp === 'enforce' ? "Qat'iy rejim (enforce): begona skriptlar bloklanadi" : csp === 'report-only' ? 'Faqat hisobot rejimi — brauzer bloklamaydi' : "CSP o'chirilgan (off)",
    fix: csp === 'enforce' ? undefined : "CSP_MODE=enforce qiling va image'ni qayta yig'ing (build-time).",
  });

  const sess = v('SESSION_SECRET');
  out.push({
    key: 'session',
    label: 'Sessiya kaliti',
    status: sess.length >= 48 ? 'ok' : sess.length >= 32 ? 'warn' : 'bad',
    detail: sess ? `SESSION_SECRET uzunligi ${sess.length} belgi (iron-session, httpOnly cookie, 8 soat / «eslab qolish» 30 kun)` : "SESSION_SECRET o'rnatilmagan",
    fix: sess.length >= 48 ? undefined : 'openssl rand -base64 48 bilan uzunroq kalit yarating (eski sessiyalar bekor bo\'ladi).',
  });

  const cron = v('CRON_SECRET');
  out.push({
    key: 'cron-secret',
    label: 'Cron himoyasi',
    status: cron.length >= 32 ? 'ok' : cron ? 'warn' : 'bad',
    detail: cron ? `CRON_SECRET bor (${cron.length} belgi); /api/cron/* faqat Bearer sarlavha bilan` : "CRON_SECRET yo'q — cron ishlari ishlamaydi",
    fix: cron.length >= 32 ? undefined : 'openssl rand -hex 32',
  });

  const tgToken = v('TELEGRAM_BOT_TOKEN');
  const tgSecret = v('TELEGRAM_WEBHOOK_SECRET');
  out.push({
    key: 'tg-webhook',
    label: 'Telegram webhook imzosi',
    status: !tgToken ? 'info' : tgSecret ? 'ok' : 'bad',
    detail: !tgToken ? 'Telegram bot sozlanmagan' : tgSecret ? "secret_token tekshiriladi — soxta so'rovlar rad etiladi" : "TELEGRAM_WEBHOOK_SECRET yo'q — production'da barcha webhook rad etiladi",
    fix: tgToken && !tgSecret ? 'openssl rand -hex 32 → .env, keyin setWebhook (DEPLOY.md §8)' : undefined,
  });

  const r2 = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_URL'].every((k) => v(k));
  out.push({
    key: 'storage',
    label: 'Fayl saqlash',
    status: r2 ? 'ok' : prod ? 'warn' : 'info',
    detail: r2 ? 'Cloudflare R2 (bulut) — serverdan mustaqil' : "Lokal disk (public/uploads) — Docker volume'siz redeploy'da yo'qoladi",
    fix: r2 ? undefined : "R2 sozlang (.env R2_*) yoki uploads volume'ni zaxiraga qo'shing.",
  });

  const hook = v('ERROR_WEBHOOK_URL');
  out.push({
    key: 'error-hook',
    label: 'Xato xabarnomasi',
    status: hook ? 'ok' : 'warn',
    detail: hook ? 'ERROR_WEBHOOK_URL sozlangan — server xatolari tashqi kanalga boradi' : "ERROR_WEBHOOK_URL yo'q — xatolar faqat logda va shu sahifada",
    fix: hook ? undefined : 'Telegram/Slack/n8n webhook manzilini ERROR_WEBHOOK_URL ga yozing.',
  });

  // Zaxira
  if (!input.backupDirExists) {
    out.push({ key: 'backup', label: 'Zaxira (backup)', status: prod ? 'bad' : 'warn', detail: `BACKUP_DIR topilmadi (${v('BACKUP_DIR') || './backups'})`, fix: 'crontab: 0 3 * * * node scripts/backup.mjs (BACKUP.md)' });
  } else if (!input.lastBackupAt) {
    out.push({ key: 'backup', label: 'Zaxira (backup)', status: 'bad', detail: 'Zaxira papkasi bor, lekin birorta zaxira topilmadi', fix: 'npm run backup; crontab (BACKUP.md)' });
  } else {
    const age = now - input.lastBackupAt.getTime();
    out.push({
      key: 'backup',
      label: 'Zaxira (backup)',
      status: age < 1.5 * DAY ? 'ok' : age < 3 * DAY ? 'warn' : 'bad',
      detail: `Oxirgi zaxira: ${timeAgo(input.lastBackupAt, now)}`,
      fix: age < 1.5 * DAY ? undefined : "Cron ishlamayapti — /var/log/savora-backup.log ni tekshiring.",
    });
  }

  // Super admin parollari
  for (const sa of input.superAdmins) {
    const upd = sa.passwordUpdatedAt ? sa.passwordUpdatedAt.getTime() : null;
    const ageDays = upd ? Math.floor((now - upd) / DAY) : null;
    out.push({
      key: `sa-${sa.username}`,
      label: `Super admin «${sa.username}»`,
      status: ageDays == null ? 'info' : ageDays > 180 ? 'warn' : 'ok',
      detail: ageDays == null ? "Parol yangilangan sanasi noma'lum" : `Parol ${ageDays} kun oldin o'rnatilgan (bcrypt, tokenVersion bilan sessiya bekor qilish)`,
      fix: ageDays != null && ageDays > 180 ? 'Har 6 oyda parolni yangilang.' : undefined,
    });
  }
  if (input.superAdmins.length > 1) {
    out.push({ key: 'sa-count', label: 'Super admin hisoblari', status: 'warn', detail: `${input.superAdmins.length} ta super admin — har biri butun platformaga ega`, fix: "Keraksizlarini o'chiring." });
  }

  // MongoDB
  const mongoUri = v('MONGO_URI');
  let mongoHost = '';
  try {
    mongoHost = new URL(mongoUri.replace(/^mongodb\+srv:/, 'mongodb:')).hostname;
  } catch {
    mongoHost = '';
  }
  const localMongo = ['mongo', 'localhost', '127.0.0.1', '::1'].includes(mongoHost) || mongoHost.endsWith('.internal');
  const hasUser = /^mongodb(\+srv)?:\/\/[^/@]+@/.test(mongoUri);
  out.push({
    key: 'mongo-auth',
    label: 'MongoDB kirish',
    status: hasUser || input.mongoAuth ? 'ok' : localMongo ? 'warn' : 'bad',
    detail: hasUser || input.mongoAuth
      ? 'Baza foydalanuvchi/parol bilan himoyalangan'
      : localMongo
        ? `Autentifikatsiyasiz, lekin faqat lokal tarmoqda (${mongoHost || 'localhost'}) — port 27017 internetga ochilmagan bo'lishi shart`
        : `Autentifikatsiyasiz va tashqi host (${mongoHost || "noma'lum"}) — xavfli`,
    fix: hasUser || input.mongoAuth ? undefined : "MongoDB'da user yarating va MONGO_URI ga qo'shing; ufw bilan 27017 ni yoping.",
  });
  if (input.mongoVersion) {
    const major = parseInt(input.mongoVersion, 10);
    out.push({ key: 'mongo-ver', label: 'MongoDB versiyasi', status: major >= 6 ? 'ok' : 'warn', detail: `v${input.mongoVersion}`, fix: major >= 6 ? undefined : "6.x yoki 7.x ga yangilang (xavfsizlik yangilanishlari)." });
  }

  out.push({
    key: 'node-ver',
    label: 'Node.js',
    status: input.nodeMajor >= 20 ? 'ok' : 'warn',
    detail: `v${input.nodeMajor} (LTS ${input.nodeMajor >= 20 ? 'qo\'llab-quvvatlanadi' : 'eskirgan'})`,
    fix: input.nodeMajor >= 20 ? undefined : 'Dockerfile: node:20-alpine yoki yangiroq.',
  });

  out.push({
    key: 'rate-limit',
    label: 'Brute-force himoyasi',
    status: 'info',
    detail: "Login: 15 daqiqada 6 urinish (login bo'yicha) va 30 (IP bo'yicha); xotirada, har ilova nusxasi alohida hisoblaydi",
    fix: "Ikki nusxa (app_a/app_b) bo'lsa limit amalda 2× — nginx limit_req bilan birga ishlaydi.",
  });

  const ai = v('ANTHROPIC_API_KEY');
  out.push({ key: 'ai', label: 'AI (Anthropic)', status: ai ? 'ok' : 'info', detail: ai ? 'API kalit sozlangan (faqat serverda)' : "Sozlanmagan — AI tahlil o'chiq" });

  return out;
}

export function postureSummary(checks: Check[]): { ok: number; warn: number; bad: number; info: number; status: 'ok' | 'warn' | 'bad' } {
  const c = { ok: 0, warn: 0, bad: 0, info: 0 };
  for (const ch of checks) c[ch.status]++;
  return { ...c, status: c.bad ? 'bad' : c.warn ? 'warn' : 'ok' };
}

// ── Cron ────────────────────────────────────────────────────────────────
export const CRON_SCHEDULE: Record<CronJob, { label: string; time: string; desc: string }> = {
  'expire-orgs': { label: 'Obuna muddati', time: '00:05', desc: "Muddati o'tgan do'konlar → expired" },
  'expiry-notifications': { label: 'Obuna eslatmasi', time: '09:00', desc: 'Obunaga 2 kun qolganda Telegram' },
  'installment-reminders': { label: 'Nasiya eslatmasi', time: '10:00', desc: "Muddati o'tgan nasiya to'lovlari" },
  'daftar-reminders': { label: 'Daftar eslatmasi', time: '10:30', desc: 'Qarz daftari — egaga Telegram, mijozga SMS' },
};

export type CronState = 'ok' | 'late' | 'failed' | 'never';

/** Kunlik ish: 26 soatdan beri bajarilmagan bo'lsa — kechikkan */
export function cronState(last: { startedAt: Date; ok: boolean } | null, now = Date.now()): CronState {
  if (!last) return 'never';
  if (!last.ok) return 'failed';
  return now - new Date(last.startedAt).getTime() > 26 * 60 * 60 * 1000 ? 'late' : 'ok';
}

export function allCronJobs(): CronJob[] {
  return [...CRON_JOBS];
}

// ── Xavfsizlik hodisalari xulosasi ──────────────────────────────────────
export const EVENT_LABELS: Record<SecurityEventType, string> = {
  login_ok: 'Kirish',
  login_fail: "Noto'g'ri parol",
  login_blocked: 'Bloklangan (limit)',
  super_login_ok: 'Super admin kirdi',
  super_login_fail: 'Super admin xato parol',
  reset_request: "Parol tiklash so'rovi",
  reset_done: 'Parol tiklandi',
  cron_forbidden: 'Cron: ruxsatsiz',
  telegram_forbidden: 'Webhook: ruxsatsiz',
  tg_login_fail: 'Mini App xato login',
};

export const SUSPICIOUS: SecurityEventType[] = ['login_fail', 'login_blocked', 'super_login_fail', 'cron_forbidden', 'telegram_forbidden', 'tg_login_fail'];

export interface EventLite { type: SecurityEventType; ip?: string; username?: string; at: Date }

export function summarizeEvents(events: EventLite[]): {
  byType: Partial<Record<SecurityEventType, number>>;
  suspicious: number;
  topIps: { ip: string; count: number; users: number }[];
  topUsers: { username: string; count: number }[];
} {
  const byType: Partial<Record<SecurityEventType, number>> = {};
  const ipMap = new Map<string, { count: number; users: Set<string> }>();
  const userMap = new Map<string, number>();
  let suspicious = 0;
  for (const e of events) {
    byType[e.type] = (byType[e.type] ?? 0) + 1;
    if (!SUSPICIOUS.includes(e.type)) continue;
    suspicious++;
    const ip = e.ip || 'unknown';
    const row = ipMap.get(ip) ?? { count: 0, users: new Set<string>() };
    row.count++;
    if (e.username) row.users.add(e.username);
    ipMap.set(ip, row);
    if (e.username) userMap.set(e.username, (userMap.get(e.username) ?? 0) + 1);
  }
  const topIps = [...ipMap.entries()].map(([ip, r]) => ({ ip, count: r.count, users: r.users.size })).sort((a, b) => b.count - a.count).slice(0, 10);
  const topUsers = [...userMap.entries()].map(([username, count]) => ({ username, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  return { byType, suspicious, topIps, topUsers };
}

/** Bitta IP dan 24 soatda 20+ shubhali urinish — hujum belgisi */
export function attackSuspects(topIps: { ip: string; count: number }[], threshold = 20): string[] {
  return topIps.filter((r) => r.count >= threshold && r.ip !== 'unknown').map((r) => r.ip);
}

/** Umumiy holat: baza yo'q → bad; posture bad yoki hujum → bad; warn → warn */
export function overallStatus(input: { dbUp: boolean; posture: 'ok' | 'warn' | 'bad'; attackers: number; errors24h: number; diskUsedPct: number | null; memUsedPct: number | null }): { status: 'ok' | 'warn' | 'bad'; reasons: string[] } {
  const reasons: string[] = [];
  let status: 'ok' | 'warn' | 'bad' = 'ok';
  const bump = (s: 'warn' | 'bad', r: string) => {
    reasons.push(r);
    if (s === 'bad') status = 'bad';
    else if (status === 'ok') status = 'warn';
  };
  if (!input.dbUp) bump('bad', "MongoDB javob bermayapti");
  if (input.posture === 'bad') bump('bad', 'Xavfsizlik auditida jiddiy kamchilik');
  if (input.attackers > 0) bump('bad', `${input.attackers} ta IP dan brute-force belgisi`);
  if (input.diskUsedPct != null && input.diskUsedPct >= 90) bump('bad', `Disk ${input.diskUsedPct}% to'lgan`);
  else if (input.diskUsedPct != null && input.diskUsedPct >= 80) bump('warn', `Disk ${input.diskUsedPct}% to'lgan`);
  if (input.memUsedPct != null && input.memUsedPct >= 90) bump('warn', `RAM ${input.memUsedPct}% band`);
  if (input.errors24h >= 50) bump('warn', `24 soatda ${input.errors24h} ta server xatosi`);
  if (input.posture === 'warn') bump('warn', 'Xavfsizlik auditida ogohlantirishlar');
  return { status, reasons };
}
