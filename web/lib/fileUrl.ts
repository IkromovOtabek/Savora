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
