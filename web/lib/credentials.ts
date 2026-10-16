import crypto from 'crypto';

/** Vaqtinchalik parol (birinchi kirishda o'zgartiriladi) — kriptografik tasodifiy (Math.random emas) */
export function generateTempPassword(): string {
  return `${randomDigits(4)}${randomBase36(4)}`;
}

function randomDigits(len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += crypto.randomInt(0, 10);
  return s;
}

function randomBase36(len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += crypto.randomInt(0, 36).toString(36);
  return s;
}

/** Super Admin panelida bcrypt hash qisqartmasi */
export function formatPasswordHash(hash: string): string {
  if (!hash) return '—';
  if (hash.length <= 24) return hash;
  return `${hash.slice(0, 12)}…${hash.slice(-8)}`;
}
