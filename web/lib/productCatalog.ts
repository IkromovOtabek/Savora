/**
 * Mahsulot katalogi (turkum, brend) — web forma va server action uchun umumiy yordamchilar.
 * Mobil tomonda shu mantiq: mobile/lib/catalog.ts → flattenCategories.
 */

export interface CategoryItem { id: string; name: string; parentId: string | null }
export interface CategoryOption { id: string; name: string; depth: number; path: string }

/** Tahrirda: mahsulotdagi eski (matn) kategoriya turkumga bog'lanmagan — o'zgarishsiz qoldiriladi */
export const LEGACY_CATEGORY_VALUE = '__legacy';

/** Nom: chetlari kesiladi, ichidagi ketma-ket bo'shliqlar bittaga */
export function normalizeCatalogName(raw: unknown): string {
  return String(raw ?? '').trim().replace(/\s+/g, ' ');
}

/** Tekis ro'yxat → daraxt tartibi (ota → bolalar), har biri chuqurlik va to'liq yo'l bilan */
export function flattenCategories(items: CategoryItem[]): CategoryOption[] {
  const ids = new Set(items.map((x) => x.id));
  const byParent = new Map<string | null, CategoryItem[]>();
  for (const it of items) {
    // Otasi o'chirilgan/yo'q bo'lsa — yuqori darajada ko'rsatiladi
    const k = it.parentId && ids.has(it.parentId) ? it.parentId : null;
    byParent.set(k, [...(byParent.get(k) ?? []), it]);
  }
  const out: CategoryOption[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number, prefix: string) => {
    for (const it of byParent.get(parent) ?? []) {
      if (seen.has(it.id)) continue; // halqa himoyasi
      seen.add(it.id);
      const path = prefix ? `${prefix} / ${it.name}` : it.name;
      out.push({ id: it.id, name: it.name, depth, path });
      if (depth < 8) walk(it.id, depth + 1, path);
    }
  };
  walk(null, 0, '');
  return out;
}
