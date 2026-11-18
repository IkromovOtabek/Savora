/**
 * Ishlab chiqarish sahifalari uchun server yordamchilari (o'qish). Backend (lib/production/*) da yo'q bo'lgan
 * yagona narsa: texkarta tahririda qatorlar uchun mahsulot hujjatini KOD bo'yicha topish — RecipeView qatorlarida
 * `productId` yo'q (faqat barqaror kod), `saveRecipeAction` esa `productId` kutadi.
 */
import type { ProductDoc } from '@/lib/models/tenant/Product';
import { branchFilter } from '@/lib/branchScope';
import { roundQty } from '@/lib/qty';
import { codeOf, GOODS_ONLY } from '@/lib/production/stock';
import type { ProductionCtx } from '@/lib/production/context';
import type { PickedProduct } from '@/components/production/common/ui';

/**
 * Kodlar → mahsulot hujjati (texkarta tahriri uchun). Tanlash tartibi: shu ombordagi «omborda» → shu ombordagi
 * istalgan → foydalanuvchi doirasidagi boshqa filial nusxasi (eng eskisi). Topilmagan kod — xaritada yo'q.
 * `available` — faqat shu ombordagi hujjat uchun (boshqa filial nusxasida — null).
 */
export async function productsByCode(ctx: ProductionCtx, codes: readonly string[], branchId: string): Promise<Map<string, PickedProduct>> {
  const uniq = [...new Set(codes.filter(Boolean).map((c) => c.toUpperCase()))];
  const out = new Map<string, PickedProduct>();
  if (!uniq.length) return out;
  const docs = await ctx.m.Product.find({
    ...branchFilter(ctx.user),
    ...GOODS_ONLY,
    trackQuantity: true,
    $or: [{ itemCode: { $in: uniq } }, { itemCode: { $exists: false }, productId: { $in: uniq } }],
  })
    .select('name itemCode productId unit purchaseUnit purchaseFactor quantity soldQuantity status branchId createdAt')
    .sort({ createdAt: 1 })
    .limit(uniq.length * 20)
    .lean<ProductDoc[]>();

  const rank = (p: ProductDoc) => (String(p.branchId) === branchId ? (p.status === 'in_stock' ? 0 : 1) : 2);
  const best = new Map<string, ProductDoc>();
  for (const p of docs) {
    const code = codeOf(p);
    if (!code) continue;
    const cur = best.get(code);
    if (!cur || rank(p) < rank(cur)) best.set(code, p);
  }
  for (const [code, p] of best) {
    const here = String(p.branchId) === branchId;
    out.set(code, {
      id: String(p._id),
      code,
      name: p.name,
      unit: p.unit ?? null,
      purchaseUnit: p.purchaseUnit ?? null,
      purchaseFactor: p.purchaseFactor ?? null,
      available: here ? (p.status === 'in_stock' ? Math.max(0, roundQty((p.quantity ?? 0) - (p.soldQuantity ?? 0))) : 0) : null,
    });
  }
  return out;
}

/** `?b=` — ruxsat etilgan ombor (meta ro'yxatida bo'lsa), aks holda standart */
export function pickBranch(requested: string | undefined, branches: readonly { id: string }[], fallback: string): string {
  return requested && branches.some((b) => b.id === requested) ? requested : fallback;
}
