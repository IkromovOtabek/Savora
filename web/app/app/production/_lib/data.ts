/**
 * Ishlab chiqarish sahifalari uchun server yordamchilari. Texkarta qatorlaridagi mahsulot hujjati (`productId`)
 * endi backendda — `getRecipe` (lib/production/recipes.ts) qatorlarda beradi.
 */

/** `?b=` — ruxsat etilgan ombor (meta ro'yxatida bo'lsa), aks holda standart */
export function pickBranch(requested: string | undefined, branches: readonly { id: string }[], fallback: string): string {
  return requested && branches.some((b) => b.id === requested) ? requested : fallback;
}
