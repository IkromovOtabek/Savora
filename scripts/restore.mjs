/**
 * Zaxiradan tiklash (restore).
 *
 * Ishlatish:
 *   node --env-file=.env scripts/restore.mjs <zaxira-papka> [bazaNomi]
 *
 * Misollar:
 *   # Bitta bazani tiklash:
 *   node --env-file=.env scripts/restore.mjs backups/2026-06-19_03-00 tenant_dokon1
 *   # Barcha bazalarni tiklash (ehtiyot bo'ling — mavjud ma'lumot ustiga yoziladi):
 *   node --env-file=.env scripts/restore.mjs backups/2026-06-19_03-00
 *
 * Talab: `mongorestore` (MongoDB Database Tools).
 */
import { spawn } from 'child_process';
import { readdir } from 'fs/promises';
import path from 'path';

const URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const dir = process.argv[2];
const onlyDb = process.argv[3];

if (!dir) {
  console.error('Foydalanish: node --env-file=.env scripts/restore.mjs <zaxira-papka> [bazaNomi]');
  process.exit(1);
}

function restore(archivePath, dbName) {
  return new Promise((resolve, reject) => {
    const args = ['--uri', URI, '--gzip', '--archive', archivePath, '--nsInclude', `${dbName}.*`, '--drop'];
    const proc = spawn('mongorestore', args, { stdio: ['ignore', 'ignore', 'inherit'] });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`mongorestore xato (kod ${code})`))));
  });
}

async function main() {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.gz'));
  const targets = onlyDb ? files.filter((f) => f === `${onlyDb}.gz`) : files;

  if (targets.length === 0) {
    console.error(`Zaxira topilmadi: ${onlyDb ? `${onlyDb}.gz` : '*.gz'} (${dir})`);
    process.exit(1);
  }

  console.log(`Tiklash: ${targets.length} ta baza (${dir})`);
  for (const f of targets) {
    const dbName = f.replace(/\.gz$/, '');
    try {
      await restore(path.join(dir, f), dbName);
      console.log(`  ✓ ${dbName}`);
    } catch (e) {
      console.error(`  ✗ ${dbName}: ${e.message}`);
    }
  }
  console.log('Tugadi.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
