/**
 * Mijoz QR-menyusi manzili — sof funksiyalar (client'da ham ishlaydi; token yaratish serverda: setup.ts).
 *
 * Manzil: /m/<do'kon slug>/<stol qrToken>. Alohida «menu slug» saqlanmaydi — do'kon `slug` i master
 * bazada noyob va har so'rovda tenantni topish uchun yetarli (Organization.slug → dbName).
 * Token tasodifiy (128 bit, base64url) — stol raqamidan taxmin qilib bo'lmaydi; almashtirilsa eski QR ishlamaydi.
 */

/** Stol tokeni: base64url, 16–64 belgi */
export function isQrToken(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(v);
}

/** Do'kon slug'i (lib/slug.ts qoidasi bilan bir xil: kichik harf, raqam, tire; 3–32) */
export function isMenuSlug(v: unknown): v is string {
  return typeof v === 'string' && v.length >= 3 && v.length <= 32 && /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/.test(v);
}

/** Mijoz sahifasi yo'li (QR-kodga shu + sayt manzili yoziladi) */
export function qrMenuPath(slug: string, token: string): string {
  return `/m/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`;
}

/** Ochiq API yo'li */
export function publicMenuApiPath(slug: string, token: string): string {
  return `/api/public/menu/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`;
}

/**
 * Restoranning umumiy mijoz sahifasi (stolsiz): /m/<slug> — menyu, aloqa, ish vaqti. Buyurtma bermaydi
 * (buyurtma — faqat stol QR orqali). Kirish eshigi plakati, Instagram/Telegram havolasi uchun.
 */
export function restaurantPagePath(slug: string): string {
  return `/m/${encodeURIComponent(slug)}`;
}

/** Mijoz sahifasining ochiq API'si (faqat o'qish) */
export function publicStoreApiPath(slug: string): string {
  return `/api/public/menu/${encodeURIComponent(slug)}`;
}

/** Brend rangi: #RRGGBB */
export function isBrandColor(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}
