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

/** Turkumning o'zi va barcha ichki (avlod) turkumlari id'lari — filtrlash uchun */
export function categorySubtreeIds(items: CategoryItem[], rootId: string): Set<string> {
  const kids = new Map<string, string[]>();
  for (const it of items) {
    if (!it.parentId) continue;
    kids.set(it.parentId, [...(kids.get(it.parentId) ?? []), it.id]);
  }
  const out = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    for (const k of kids.get(stack.pop()!) ?? []) {
      if (out.has(k)) continue; // halqa himoyasi
      out.add(k);
      stack.push(k);
    }
  }
  return out;
}

/** Turkum chuqurligi: yuqori daraja = 1. Topilmasa yoki halqa bo'lsa — null */
export function categoryLevel(items: CategoryItem[], id: string): number | null {
  const byId = new Map(items.map((x) => [x.id, x]));
  let cur = byId.get(id);
  let level = 0;
  const seen = new Set<string>();
  while (cur) {
    if (seen.has(cur.id)) return null;
    seen.add(cur.id);
    level++;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return level || null;
}

/** Turkum ichidagi eng chuqur shoxning balandligi: bolasi yo'q = 1 */
export function categoryHeight(items: CategoryItem[], id: string): number {
  const sub = categorySubtreeIds(items, id);
  let max = 1;
  for (const x of sub) {
    let h = 1;
    let cur = items.find((i) => i.id === x);
    while (cur && cur.id !== id && cur.parentId) {
      h++;
      cur = items.find((i) => i.id === cur!.parentId);
    }
    if (h > max) max = h;
  }
  return max;
}

/**
 * Turkumni boshqa ota ostiga ko'chirish mumkinmi:
 *  'cycle' — o'zi yoki o'z avlodi ichiga; 'tooDeep' — chegaradan oshadi; null — mumkin
 */
export function categoryMoveError(
  items: CategoryItem[],
  id: string,
  newParentId: string | null,
  maxDepth: number,
): 'cycle' | 'tooDeep' | null {
  if (newParentId && categorySubtreeIds(items, id).has(newParentId)) return 'cycle';
  const parentLevel = newParentId ? categoryLevel(items, newParentId) ?? 0 : 0;
  return parentLevel + categoryHeight(items, id) > maxDepth ? 'tooDeep' : null;
}

/**
 * Kassa chiplari: yuqori darajadagi turkumlar (ichki turkumlari bilan) — faqat ichida mahsulot borlari.
 * `usedIds` — mahsulotlarda uchragan categoryId'lar.
 */
export function topCategoryChips(items: CategoryItem[], usedIds: Set<string>): { id: string; name: string; ids: Set<string> }[] {
  if (!usedIds.size) return [];
  const known = new Set(items.map((c) => c.id));
  return items
    .filter((c) => !c.parentId || !known.has(c.parentId))
    .map((c) => ({ id: c.id, name: c.name, ids: categorySubtreeIds(items, c.id) }))
    .filter((c) => [...c.ids].some((id) => usedIds.has(id)));
}
