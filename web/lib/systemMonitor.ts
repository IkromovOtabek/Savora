/**
 * Super Admin → Monitoring uchun server tomonidan ma'lumot yig'ish.
 * Har bir yig'uvchi mustaqil: xato bo'lsa null/xabar qaytaradi, sahifa yiqilmaydi.
 * Sir qiymatlar (parol, token, ulanish satri) hech qachon qaytarilmaydi.
 */
import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import { getBaseConnection } from './db';
import { getMasterModels } from './masterDb';
import { rateLimitStats } from './rateLimit';
import { instanceId } from './securityEvents';
import { isRemoteStorageEnabled } from './storage';
import {
  securityPosture, postureSummary, summarizeEvents, attackSuspects, overallStatus, cronState, allCronJobs, percent,
  type Check, type EventLite, type CronState,
} from './monitorChecks';
import type { ISecurityEvent } from './models/master/SecurityEvent';
import type { ISystemLog } from './models/master/SystemLog';
import type { ICronRun } from './models/master/CronRun';
import type { CronJob } from './models/master/CronRun';

const DAY = 24 * 60 * 60 * 1000;

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error(`${label}: ${ms} ms ichida javob yo'q`)), ms); });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (t) clearTimeout(t);
  }
}

/** Xato bo'lsa sahifa yiqilmasin — {data} yoki {error} */
export type Safe<T> = { data: T; error?: undefined } | { data?: undefined; error: string };
async function safe<T>(label: string, fn: () => Promise<T>, ms = 4000): Promise<Safe<T>> {
  try {
    return { data: await withTimeout(fn(), ms, label) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Jarayon / OS ────────────────────────────────────────────────────────
export interface ProcessInfo {
  node: string;
  nextVersion: string | null;
  pid: number;
  instance: string;
  uptimeSec: number;
  startedAt: Date;
  version: string | null;
  nodeEnv: string;
  timezone: string;
  serverTime: Date;
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  eventLoopLagMs: number;
  cpuUserMs: number;
  cpuSystemMs: number;
}

async function measureEventLoopLag(): Promise<number> {
  const start = process.hrtime.bigint();
  await new Promise((r) => setTimeout(r, 20));
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  return Math.max(0, Math.round((elapsedMs - 20) * 10) / 10);
}

export async function getProcessInfo(): Promise<ProcessInfo> {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  let nextVersion: string | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nextVersion = (require('next/package.json') as { version: string }).version;
  } catch {
    nextVersion = null;
  }
  return {
    node: process.version,
    nextVersion,
    pid: process.pid,
    instance: instanceId(),
    uptimeSec: Math.round(process.uptime()),
    startedAt: new Date(Date.now() - process.uptime() * 1000),
    version: process.env.APP_VERSION || null,
    nodeEnv: process.env.NODE_ENV || 'development',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    serverTime: new Date(),
    rss: mem.rss,
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    external: mem.external,
    eventLoopLagMs: await measureEventLoopLag(),
    cpuUserMs: Math.round(cpu.user / 1000),
    cpuSystemMs: Math.round(cpu.system / 1000),
  };
}

export interface OsInfo {
  hostname: string;
  platform: string;
  release: string;
  arch: string;
  cpus: number;
  cpuModel: string;
  load1: number;
  load5: number;
  load15: number;
  totalMem: number;
  freeMem: number;
  /** cgroup (Docker) limiti — bo'lsa */
  containerMemLimit: number | null;
  containerMemUsage: number | null;
  osUptimeSec: number;
  inDocker: boolean;
}

async function readNum(file: string): Promise<number | null> {
  try {
    const t = (await fs.readFile(file, 'utf8')).trim();
    if (!t || t === 'max') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function getOsInfo(): Promise<OsInfo> {
  const [l1, l5, l15] = os.loadavg();
  const cpus = os.cpus();
  const inDocker = await fs.access('/.dockerenv').then(() => true).catch(() => false);
  // cgroup v2 → v1
  const limit = (await readNum('/sys/fs/cgroup/memory.max')) ?? (await readNum('/sys/fs/cgroup/memory/memory.limit_in_bytes'));
  const usage = (await readNum('/sys/fs/cgroup/memory.current')) ?? (await readNum('/sys/fs/cgroup/memory/memory.usage_in_bytes'));
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpus: cpus.length,
    cpuModel: cpus[0]?.model?.trim() || '—',
    load1: Math.round(l1 * 100) / 100,
    load5: Math.round(l5 * 100) / 100,
    load15: Math.round(l15 * 100) / 100,
    totalMem: os.totalmem(),
    freeMem: os.freemem(),
    containerMemLimit: limit && limit < 2 ** 60 ? limit : null,
    containerMemUsage: usage,
    osUptimeSec: Math.round(os.uptime()),
    inDocker,
  };
}

// ── Disk va zaxira ──────────────────────────────────────────────────────
export interface DiskMount { label: string; path: string; total: number; free: number; usedPct: number }

async function statfsSafe(label: string, p: string): Promise<DiskMount | null> {
  try {
    const s = await fs.statfs(p);
    const total = Number(s.blocks) * Number(s.bsize);
    const free = Number(s.bavail) * Number(s.bsize);
    return { label, path: p, total, free, usedPct: percent(total - free, total) };
  } catch {
    return null;
  }
}

export async function getDiskInfo(): Promise<{ mounts: DiskMount[]; uploads: { path: string; files: number; bytes: number; truncated: boolean } | null }> {
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
  const backupDir = path.resolve(process.env.BACKUP_DIR || './backups');
  const candidates: [string, string][] = [['Ilova', process.cwd()], ['Yuklamalar', uploadsDir], ['Zaxira', backupDir]];
  const mounts: DiskMount[] = [];
  const seen = new Set<string>();
  for (const [label, p] of candidates) {
    const m = await statfsSafe(label, p);
    if (!m) continue;
    const key = `${m.total}:${m.free}`;
    if (seen.has(key)) continue; // bir xil bo'lim — takrorlamaymiz
    seen.add(key);
    mounts.push(m);
  }
  // Yuklamalar hajmi (10 000 faylgacha — katta papkada sahifani sekinlashtirmaslik uchun)
  let uploads: { path: string; files: number; bytes: number; truncated: boolean } | null = null;
  try {
    let files = 0;
    let bytes = 0;
    let truncated = false;
    const stack = [uploadsDir];
    while (stack.length && !truncated) {
      const dir = stack.pop()!;
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) stack.push(full);
        else {
          const st = await fs.stat(full).catch(() => null);
          if (st) { files++; bytes += st.size; }
          if (files >= 10_000) { truncated = true; break; }
        }
      }
    }
    uploads = { path: uploadsDir, files, bytes, truncated };
  } catch {
    uploads = null;
  }
  return { mounts, uploads };
}

export interface BackupInfo {
  dir: string;
  exists: boolean;
  count: number;
  latest: { name: string; at: Date; bytes: number; files: number } | null;
  keepDays: number;
}

export async function getBackupInfo(): Promise<BackupInfo> {
  const dir = path.resolve(process.env.BACKUP_DIR || './backups');
  const keepDays = Number(process.env.BACKUP_KEEP_DAYS || 14);
  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return { dir, exists: false, count: 0, latest: null, keepDays };
  }
  const dirs = entries.filter((e) => e.isDirectory());
  let latest: BackupInfo['latest'] = null;
  for (const d of dirs) {
    const full = path.join(dir, d.name);
    const st = await fs.stat(full).catch(() => null);
    if (!st) continue;
    if (!latest || st.mtimeMs > latest.at.getTime()) latest = { name: d.name, at: st.mtime, bytes: 0, files: 0 };
  }
  if (latest) {
    try {
      const files = await fs.readdir(path.join(dir, latest.name));
      for (const f of files) {
        const st = await fs.stat(path.join(dir, latest.name, f)).catch(() => null);
        if (st?.isFile()) { latest.files++; latest.bytes += st.size; }
      }
    } catch { /* hajm hisoblanmadi */ }
  }
  return { dir, exists: true, count: dirs.length, latest, keepDays };
}

// ── MongoDB ─────────────────────────────────────────────────────────────
export interface DbInfo {
  up: boolean;
  pingMs: number;
  version: string | null;
  masterDb: string;
  readyState: number;
  /** serverStatus (ruxsat bo'lsa) */
  server: {
    uptimeSec: number;
    connectionsCurrent: number;
    connectionsAvailable: number;
    opInsert: number; opQuery: number; opUpdate: number; opDelete: number;
    residentMb: number;
    authEnabled: boolean | null;
    storageEngine: string | null;
  } | null;
  master: { collections: number; objects: number; dataSize: number; storageSize: number; indexSize: number } | null;
  /** Barcha bazalar (nom + diskdagi hajm) */
  databases: { name: string; sizeOnDisk: number }[] | null;
  totalSizeOnDisk: number | null;
  permissionNote: string | null;
}

export async function getDbInfo(): Promise<DbInfo> {
  const t0 = Date.now();
  const conn = await getBaseConnection();
  const admin = conn.db!.admin();
  await admin.ping();
  const pingMs = Date.now() - t0;
  const info: DbInfo = {
    up: true, pingMs, version: null, masterDb: conn.db!.databaseName, readyState: conn.readyState,
    server: null, master: null, databases: null, totalSizeOnDisk: null, permissionNote: null,
  };
  try {
    const b = (await admin.buildInfo()) as { version?: string };
    info.version = b.version ?? null;
  } catch { /* ruxsat yo'q */ }
  try {
    const s = (await admin.serverStatus()) as Record<string, unknown>;
    const conns = (s.connections ?? {}) as Record<string, number>;
    const ops = (s.opcounters ?? {}) as Record<string, number>;
    const mem = (s.mem ?? {}) as Record<string, number>;
    const sec = (s.security ?? {}) as Record<string, unknown>;
    const se = (s.storageEngine ?? {}) as Record<string, string>;
    info.server = {
      uptimeSec: Number(s.uptime ?? 0),
      connectionsCurrent: conns.current ?? 0,
      connectionsAvailable: conns.available ?? 0,
      opInsert: ops.insert ?? 0, opQuery: ops.query ?? 0, opUpdate: ops.update ?? 0, opDelete: ops.delete ?? 0,
      residentMb: mem.resident ?? 0,
      authEnabled: typeof sec.authentication === 'object' && sec.authentication ? true : sec.authentication == null ? null : false,
      storageEngine: se.name ?? null,
    };
  } catch {
    info.permissionNote = "serverStatus uchun ruxsat yo'q (clusterMonitor roli kerak)";
  }
  try {
    const st = (await conn.db!.stats()) as Record<string, number>;
    info.master = { collections: st.collections ?? 0, objects: st.objects ?? 0, dataSize: st.dataSize ?? 0, storageSize: st.storageSize ?? 0, indexSize: st.indexSize ?? 0 };
  } catch { /* ruxsat yo'q */ }
  try {
    const l = (await admin.listDatabases()) as { databases: { name: string; sizeOnDisk?: number }[]; totalSize?: number };
    info.databases = l.databases.map((d) => ({ name: d.name, sizeOnDisk: d.sizeOnDisk ?? 0 })).sort((a, b) => b.sizeOnDisk - a.sizeOnDisk);
    info.totalSizeOnDisk = l.totalSize ?? info.databases.reduce((s, d) => s + d.sizeOnDisk, 0);
  } catch {
    info.permissionNote = (info.permissionNote ? info.permissionNote + '; ' : '') + "listDatabases uchun ruxsat yo'q";
  }
  return info;
}

// ── Do'kon bazalari ─────────────────────────────────────────────────────
export interface TenantDbRow { name: string; slug: string; dbName: string; status: string; sizeOnDisk: number | null; users: number }
export interface TenantsInfo {
  total: number;
  byStatus: Record<string, number>;
  rows: TenantDbRow[];
  /** Organization yozuvi yo'q, lekin baza bor */
  orphanDbs: string[];
  /** Organization bor, lekin baza topilmadi (hali yozuv yo'q bo'lishi mumkin) */
  missingDbs: string[];
}

export async function getTenantsInfo(databases: { name: string; sizeOnDisk: number }[] | null): Promise<TenantsInfo> {
  const { Organization } = await getMasterModels();
  const orgs = await Organization.find().select('name slug dbName status users').lean();
  const sizes = new Map((databases ?? []).map((d) => [d.name, d.sizeOnDisk]));
  const byStatus: Record<string, number> = {};
  const rows: TenantDbRow[] = orgs.map((o) => {
    byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
    return { name: o.name, slug: o.slug, dbName: o.dbName, status: o.status, sizeOnDisk: sizes.has(o.dbName) ? sizes.get(o.dbName)! : null, users: o.users?.length ?? 0 };
  });
  rows.sort((a, b) => (b.sizeOnDisk ?? -1) - (a.sizeOnDisk ?? -1));
  const known = new Set(orgs.map((o) => o.dbName));
  const system = new Set(['admin', 'local', 'config', process.env.MASTER_DB_NAME || 'savdopro_master']);
  const orphanDbs = (databases ?? []).map((d) => d.name).filter((n) => !known.has(n) && !system.has(n));
  const missingDbs = databases ? orgs.filter((o) => !sizes.has(o.dbName)).map((o) => o.dbName) : [];
  return { total: orgs.length, byStatus, rows, orphanDbs, missingDbs };
}

// ── Telegram ────────────────────────────────────────────────────────────
export interface TelegramInfo {
  configured: boolean;
  botUsername: string | null;
  webhookUrl: string | null;
  pendingUpdates: number | null;
  lastError: { at: Date; message: string } | null;
  hasSecret: boolean;
  chatIdSet: boolean;
  error: string | null;
}

export async function getTelegramInfo(): Promise<TelegramInfo> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const base: TelegramInfo = {
    configured: !!token, botUsername: process.env.TELEGRAM_BOT_USERNAME || null, webhookUrl: null, pendingUpdates: null,
    lastError: null, hasSecret: !!process.env.TELEGRAM_WEBHOOK_SECRET, chatIdSet: !!process.env.TELEGRAM_CHAT_ID, error: null,
  };
  if (!token) return base;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const [wh, me] = await Promise.all([
      fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, { signal: ctrl.signal }).then((r) => r.json()),
      fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: ctrl.signal }).then((r) => r.json()),
    ]);
    clearTimeout(t);
    if (!wh?.ok) {
      base.error = wh?.description ? `Telegram: ${wh.description}` : "Telegram API javob bermadi (token noto'g'ri bo'lishi mumkin)";
      return base;
    }
    const r = wh.result ?? {};
    base.webhookUrl = r.url || null;
    base.pendingUpdates = typeof r.pending_update_count === 'number' ? r.pending_update_count : null;
    if (r.last_error_date) base.lastError = { at: new Date(r.last_error_date * 1000), message: String(r.last_error_message || '') };
    if (me?.ok && me.result?.username) base.botUsername = `@${me.result.username}`;
  } catch (err) {
    base.error = err instanceof Error && err.name === 'AbortError' ? 'Telegram API 3 s ichida javob bermadi' : "Telegram API ga ulanib bo'lmadi";
  }
  return base;
}

// ── Xavfsizlik hodisalari / loglar / cron ───────────────────────────────
export interface SecurityInfo {
  last24h: ReturnType<typeof summarizeEvents>;
  last7d: { suspicious: number; total: number };
  recent: (ISecurityEvent & { _id: string })[];
  attackers: string[];
  rateLimit: ReturnType<typeof rateLimitStats>;
}

export async function getSecurityInfo(): Promise<SecurityInfo> {
  const { SecurityEvent } = await getMasterModels();
  const now = Date.now();
  const [ev24, ev7d, recent] = await Promise.all([
    SecurityEvent.find({ at: { $gte: new Date(now - DAY) } }).select('type ip username at').lean(),
    SecurityEvent.aggregate<{ _id: string; n: number }>([{ $match: { at: { $gte: new Date(now - 7 * DAY) } } }, { $group: { _id: '$type', n: { $sum: 1 } } }]),
    SecurityEvent.find().sort({ at: -1 }).limit(60).lean(),
  ]);
  const last24h = summarizeEvents(ev24 as EventLite[]);
  const suspiciousTypes = new Set(['login_fail', 'login_blocked', 'super_login_fail', 'cron_forbidden', 'telegram_forbidden', 'tg_login_fail']);
  const last7d = ev7d.reduce((acc, r) => ({ total: acc.total + r.n, suspicious: acc.suspicious + (suspiciousTypes.has(r._id) ? r.n : 0) }), { total: 0, suspicious: 0 });
  return {
    last24h,
    last7d,
    recent: recent.map((r) => ({ ...(r as ISecurityEvent), _id: String((r as { _id: unknown })._id) })),
    attackers: attackSuspects(last24h.topIps),
    rateLimit: rateLimitStats(),
  };
}

export interface LogsInfo {
  errors24h: number;
  warns24h: number;
  errors7d: number;
  recent: (ISystemLog & { _id: string })[];
  /** Eng ko'p takrorlangan xabarlar (7 kun) */
  top: { msg: string; n: number; last: Date }[];
}

export async function getLogsInfo(): Promise<LogsInfo> {
  const { SystemLog } = await getMasterModels();
  const now = Date.now();
  const [errors24h, warns24h, errors7d, recent, top] = await Promise.all([
    SystemLog.countDocuments({ level: 'error', at: { $gte: new Date(now - DAY) } }),
    SystemLog.countDocuments({ level: 'warn', at: { $gte: new Date(now - DAY) } }),
    SystemLog.countDocuments({ level: 'error', at: { $gte: new Date(now - 7 * DAY) } }),
    SystemLog.find().sort({ at: -1 }).limit(40).lean(),
    SystemLog.aggregate<{ _id: string; n: number; last: Date }>([
      { $match: { at: { $gte: new Date(now - 7 * DAY) } } },
      { $group: { _id: '$msg', n: { $sum: 1 }, last: { $max: '$at' } } },
      { $sort: { n: -1 } }, { $limit: 8 },
    ]),
  ]);
  return {
    errors24h, warns24h, errors7d,
    recent: recent.map((r) => ({ ...(r as ISystemLog), _id: String((r as { _id: unknown })._id) })),
    top: top.map((t) => ({ msg: t._id, n: t.n, last: t.last })),
  };
}

export interface CronJobStatus { job: CronJob; state: CronState; last: (ICronRun & { _id: string }) | null; runs7d: number; fails7d: number }
export interface CronInfo { jobs: CronJobStatus[]; recent: (ICronRun & { _id: string })[]; secretSet: boolean }

export async function getCronInfo(): Promise<CronInfo> {
  const { CronRun } = await getMasterModels();
  const now = Date.now();
  const [recent, agg] = await Promise.all([
    CronRun.find().sort({ startedAt: -1 }).limit(30).lean(),
    CronRun.aggregate<{ _id: string; n: number; fails: number }>([
      { $match: { startedAt: { $gte: new Date(now - 7 * DAY) } } },
      { $group: { _id: '$job', n: { $sum: 1 }, fails: { $sum: { $cond: ['$ok', 0, 1] } } } },
    ]),
  ]);
  const aggMap = new Map(agg.map((a) => [a._id, a]));
  const jobs: CronJobStatus[] = [];
  for (const job of allCronJobs()) {
    const lastDoc = await CronRun.findOne({ job }).sort({ startedAt: -1 }).lean();
    const last = lastDoc ? { ...(lastDoc as ICronRun), _id: String((lastDoc as { _id: unknown })._id) } : null;
    jobs.push({ job, state: cronState(last, now), last, runs7d: aggMap.get(job)?.n ?? 0, fails7d: aggMap.get(job)?.fails ?? 0 });
  }
  return {
    jobs,
    recent: recent.map((r) => ({ ...(r as ICronRun), _id: String((r as { _id: unknown })._id) })),
    secretSet: !!process.env.CRON_SECRET,
  };
}

// ── Integratsiyalar ─────────────────────────────────────────────────────
export interface Integration { key: string; label: string; status: 'ok' | 'off' | 'warn'; detail: string }

export function getIntegrations(): Integration[] {
  const v = (k: string) => !!(process.env[k] ?? '').trim();
  return [
    { key: 'r2', label: 'Cloudflare R2 (fayllar)', status: isRemoteStorageEnabled() ? 'ok' : 'off', detail: isRemoteStorageEnabled() ? `bucket: ${process.env.R2_BUCKET}` : 'lokal disk (public/uploads)' },
    { key: 'eskiz', label: 'Eskiz SMS', status: v('ESKIZ_EMAIL') && v('ESKIZ_PASSWORD') ? 'ok' : v('ESKIZ_EMAIL') || v('ESKIZ_PASSWORD') ? 'warn' : 'off', detail: v('ESKIZ_EMAIL') && v('ESKIZ_PASSWORD') ? `jo'natuvchi: ${process.env.ESKIZ_FROM || '4546'}` : 'SMS yuborilmaydi' },
    { key: 'tg', label: 'Telegram bot', status: v('TELEGRAM_BOT_TOKEN') ? (v('TELEGRAM_WEBHOOK_SECRET') ? 'ok' : 'warn') : 'off', detail: v('TELEGRAM_BOT_TOKEN') ? (v('TELEGRAM_WEBHOOK_SECRET') ? 'webhook imzosi bilan' : 'webhook imzosi YO\'Q') : 'sozlanmagan' },
    { key: 'ai', label: 'Anthropic AI', status: v('ANTHROPIC_API_KEY') ? 'ok' : 'off', detail: v('ANTHROPIC_API_KEY') ? `model: ${process.env.ANTHROPIC_MODEL || 'standart'}` : 'AI tahlil o\'chiq' },
    { key: 'hook', label: 'Xato webhook', status: v('ERROR_WEBHOOK_URL') ? 'ok' : 'warn', detail: v('ERROR_WEBHOOK_URL') ? 'xatolar tashqi kanalga yuboriladi' : 'faqat log + shu sahifa' },
  ];
}

// ── Hammasini yig'ish ───────────────────────────────────────────────────
export interface MonitoringSnapshot {
  generatedAt: Date;
  process: Safe<ProcessInfo>;
  os: Safe<OsInfo>;
  disk: Safe<Awaited<ReturnType<typeof getDiskInfo>>>;
  backup: Safe<BackupInfo>;
  db: Safe<DbInfo>;
  tenants: Safe<TenantsInfo>;
  telegram: Safe<TelegramInfo>;
  security: Safe<SecurityInfo>;
  logs: Safe<LogsInfo>;
  cron: Safe<CronInfo>;
  integrations: Integration[];
  posture: Check[];
  postureSummary: ReturnType<typeof postureSummary>;
  overall: ReturnType<typeof overallStatus>;
}

export async function collectMonitoring(): Promise<MonitoringSnapshot> {
  const db = await safe('MongoDB', getDbInfo, 5000);
  const [proc, osInfo, disk, backup, tenants, telegram, security, logs, cron, superAdmins] = await Promise.all([
    safe('Jarayon', getProcessInfo),
    safe('OS', getOsInfo),
    safe('Disk', getDiskInfo, 6000),
    safe('Zaxira', getBackupInfo),
    safe("Do'kon bazalari", () => getTenantsInfo(db.data?.databases ?? null)),
    safe('Telegram', getTelegramInfo, 4000),
    safe('Xavfsizlik hodisalari', getSecurityInfo),
    safe('Xatolar jurnali', getLogsInfo),
    safe('Cron', getCronInfo),
    safe('Super adminlar', async () => {
      const { SuperAdmin } = await getMasterModels();
      const list = await SuperAdmin.find().select('username updatedAt').lean();
      return list.map((s) => ({ username: s.username, passwordUpdatedAt: (s as { updatedAt?: Date }).updatedAt ?? null }));
    }),
  ]);

  const posture = securityPosture({
    env: process.env,
    superAdmins: superAdmins.data ?? [],
    lastBackupAt: backup.data?.latest?.at ?? null,
    backupDirExists: backup.data?.exists ?? false,
    mongoAuth: db.data?.server?.authEnabled ?? null,
    mongoVersion: db.data?.version ?? null,
    nodeMajor: parseInt(process.versions.node, 10),
  });
  const ps = postureSummary(posture);
  const diskMain = disk.data?.mounts[0] ?? null;
  const memUsedPct = osInfo.data
    ? osInfo.data.containerMemLimit && osInfo.data.containerMemUsage != null
      ? percent(osInfo.data.containerMemUsage, osInfo.data.containerMemLimit)
      : percent(osInfo.data.totalMem - osInfo.data.freeMem, osInfo.data.totalMem)
    : null;
  const overall = overallStatus({
    dbUp: !!db.data?.up,
    posture: ps.status,
    attackers: security.data?.attackers.length ?? 0,
    errors24h: logs.data?.errors24h ?? 0,
    diskUsedPct: diskMain?.usedPct ?? null,
    memUsedPct,
  });

  return {
    generatedAt: new Date(),
    process: proc, os: osInfo, disk, backup, db, tenants, telegram, security, logs, cron,
    integrations: getIntegrations(),
    posture, postureSummary: ps, overall,
  };
}
