/**
 * To'liq zaxira (backup) — master DB + barcha tenant bazalari.
 *
 * Ishlatish:
 *   node --env-file=.env scripts/backup.mjs
 *
 * Talab: tizimda `mongodump` o'rnatilgan bo'lishi kerak (MongoDB Database Tools).
 *   macOS:  brew install mongodb-database-tools
 *   Ubuntu: apt-get install mongodb-database-tools
 *
 * Natija: BACKUP_DIR/<YYYY-MM-DD_HH-mm>/  — har bazaning gzip arxivi.
 * Eski zaxiralar: BACKUP_KEEP_DAYS (default 14) kundan oshganlari o'chiriladi.
 *
 * Cron (har kuni 03:00):
 *   0 3 * * * cd /var/www/savdopro && node --env-file=.env scripts/backup.mjs >> backups/backup.log 2>&1
 */
import mongoose from 'mongoose';
import { spawn } from 'child_process';
import { mkdir, readdir, rm, stat } from 'fs/promises';
import path from 'path';

const URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const MASTER = process.env.MASTER_DB_NAME || 'savdopro_master';
const BACKUP_DIR = process.env.BACKUP_DIR || './backups';
const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS || 14);

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
}

function dump(dbName, outDir) {
  return new Promise((resolve, reject) => {
    const args = ['--uri', URI, '--db', dbName, '--gzip', '--archive', path.join(outDir, `${dbName}.gz`)];
    const proc = spawn('mongodump', args, { stdio: ['ignore', 'ignore', 'inherit'] });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`mongodump ${dbName} xato (kod ${code})`))));
  });
}

async function pruneOld() {
  let entries;
  try {
    entries = await readdir(BACKUP_DIR, { withFileTypes: true });
  } catch {
    return;
  }
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const full = path.join(BACKUP_DIR, e.name);
    const s = await stat(full).catch(() => null);
    if (s && s.mtimeMs < cutoff) {
      await rm(full, { recursive: true, force: true });
      console.log(`  eski zaxira o'chirildi: ${e.name}`);
    }
  }
}

async function main() {
  const outDir = path.join(BACKUP_DIR, stamp());
  await mkdir(outDir, { recursive: true });

  const conn = await mongoose.createConnection(URI, { dbName: MASTER }).asPromise();
  const orgs = await conn.collection('organizations').find({}, { projection: { dbName: 1 } }).toArray();
  await conn.close();

  const dbNames = [MASTER, ...orgs.map((o) => o.dbName).filter(Boolean)];
  console.log(`Zaxira boshlandi: ${dbNames.length} ta baza → ${outDir}`);

  let ok = 0;
  for (const db of dbNames) {
    try {
      await dump(db, outDir);
      ok++;
      console.log(`  ✓ ${db}`);
    } catch (e) {
      console.error(`  ✗ ${db}: ${e.message}`);
    }
  }

  await pruneOld();
  console.log(`Tugadi — ${ok}/${dbNames.length} baza zaxiralandi.`);
  process.exit(ok === dbNames.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
