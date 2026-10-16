/**
 * Fayl URL yordamchilari — TOZA (fs/server importsiz), shuning uchun client
 * komponentlarda ham ishlatish mumkin. storage.ts ham shulardan foydalanadi.
 */

/** DB dagi URL ni brauzer uchun ishlaydigan manzilga aylantiradi */
export function resolvePublicFileUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/api/uploads/')) return url;
  if (url.startsWith('/uploads/')) {
    return `/api/uploads/${url.slice('/uploads/'.length)}`;
  }
  return url;
}

/** Lokal uploads ichidagi nisbiy kalit (path traversal himoyasi bilan) */
export function localUploadKeyFromUrl(url: string): string | null {
  const resolved = resolvePublicFileUrl(url);
  if (!resolved.startsWith('/api/uploads/')) return null;
  const key = resolved.slice('/api/uploads/'.length);
  if (!key || key.includes('..')) return null;
  return key;
}

/**
 * Yuklangan fayl kaliti shakli: `<papka>/[<papka>/]<uuid>.<ext>`.
 * Faqat harf-raqam, `_`, `-`, `.`; `..`, `//`, bo'sh segment, so'rov satri — rad.
 */
const UPLOAD_KEY_RE = /^(?:[A-Za-z0-9_-]+\/)+[A-Za-z0-9_-]+\.[A-Za-z0-9]{1,8}$/;

/** Storage'ning ommaviy (R2/CDN) bazasi — server'da R2_PUBLIC_URL, client'da NEXT_PUBLIC_ varianti */
function publicStorageBase(): string {
  const base = process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL || '';
  return base.replace(/\/$/, '');
}

/**
 * Faqat O'ZIMIZNING storage'dagi fayl URL'idan kalitni ajratadi, aks holda null.
 * Qabul qilinadi: nisbiy `/api/uploads/<key>` (yoki eski `/uploads/<key>`) va
 * `R2_PUBLIC_URL/<key>`. `javascript:`, `data:`, `//host`, tashqi domen — rad.
 */
export function ownUploadKeyFromUrl(u: string, publicBase: string = publicStorageBase()): string | null {
  if (typeof u !== 'string') return null;
  const url = u.trim();
  if (!url || /[\s\\?#<>"']/.test(url)) return null;

  let key: string | null = null;
  if (url.startsWith('/api/uploads/') || url.startsWith('/uploads/')) {
    const resolved = resolvePublicFileUrl(url);
    key = resolved.slice('/api/uploads/'.length);
  } else if (publicBase && /^https?:\/\//.test(publicBase) && url.startsWith(`${publicBase}/`)) {
    key = url.slice(publicBase.length + 1);
  } else {
    return null;
  }

  if (!key || key.includes('..') || !UPLOAD_KEY_RE.test(key)) return null;
  return key;
}

/** URL bizning yuklangan faylimizga ishora qiladimi (saqlashdan/ko'rsatishdan oldin tekshiruv) */
export function isOwnUploadUrl(u: string, publicBase?: string): boolean {
  return ownUploadKeyFromUrl(u, publicBase) !== null;
}

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

export function mimeFromUploadKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() || 'jpg';
  return MIME[ext] || 'application/octet-stream';
}
