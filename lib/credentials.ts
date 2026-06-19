/** Avtomatik login: ism + tasodifiy raqam */
export function loginFromFullName(fullName: string): string {
  const parts = fullName.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const base = (parts[0] || 'user').replace(/[^a-z0-9]/g, '').slice(0, 12) || 'user';
  return `${base}${randomDigits(4)}`;
}

/** Slug asosida biznes admin login */
export function loginFromSlug(slug: string): string {
  const base = slug.replace(/[^a-z0-9]/g, '').slice(0, 8) || 'biz';
  return `${base}${randomDigits(6)}`;
}

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
