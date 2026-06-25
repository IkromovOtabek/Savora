/** Vaqtinchalik parol (birinchi kirishda o'zgartiriladi) */
export function generateTempPassword(): string {
  return `${randomDigits(4)}${Math.random().toString(36).slice(2, 6)}`;
}

function randomDigits(len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 10);
  return s;
}

/** Super Admin panelida bcrypt hash qisqartmasi */
export function formatPasswordHash(hash: string): string {
  if (!hash) return '—';
  if (hash.length <= 24) return hash;
  return `${hash.slice(0, 12)}…${hash.slice(-8)}`;
}
