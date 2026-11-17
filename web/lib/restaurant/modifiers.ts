/**
 * Taom modifikatorlari (porsiya, qo'shimcha, «achchiq») — sof tekshiruv (DB importi yo'q).
 *  - normalizeModifierGroups: mahsulotga saqlashdan oldin (sozlama formasi / server action)
 *  - resolveModifiers: buyurtmaga qo'shishda tanlangan variantlar → narx va nusxa (snapshot)
 */
import { RESTAURANT_LIMITS, type ModifierGroupInput, type OrderModifier } from './types';

export type ModifierGroupsResult = { ok: true; groups: ModifierGroupInput[] } | { ok: false };

/** Kelgan (ishonchsiz) ro'yxatni tekshiradi va tozalaydi; bo'sh massiv — modifikatorsiz */
export function normalizeModifierGroups(raw: unknown): ModifierGroupsResult {
  if (raw === undefined || raw === null) return { ok: true, groups: [] };
  if (!Array.isArray(raw) || raw.length > RESTAURANT_LIMITS.maxModifierGroups) return { ok: false };
  const groups: ModifierGroupInput[] = [];
  const names = new Set<string>();
  for (const g of raw as Record<string, unknown>[]) {
    if (!g || typeof g !== 'object') return { ok: false };
    const name = String(g.name ?? '').trim();
    if (!name || name.length > 60 || names.has(name.toLowerCase())) return { ok: false };
    names.add(name.toLowerCase());
    const rawOpts = g.options;
    if (!Array.isArray(rawOpts) || !rawOpts.length || rawOpts.length > RESTAURANT_LIMITS.maxModifierOptions) return { ok: false };
    const options: { name: string; price: number }[] = [];
    const optNames = new Set<string>();
    for (const o of rawOpts as Record<string, unknown>[]) {
      const oname = String(o?.name ?? '').trim();
      const price = Number(o?.price ?? 0);
      if (!oname || oname.length > 60 || optNames.has(oname.toLowerCase())) return { ok: false };
      if (!Number.isSafeInteger(price) || price < 0 || price > 100_000_000) return { ok: false };
      optNames.add(oname.toLowerCase());
      options.push({ name: oname, price });
    }
    const required = g.required === true;
    const min = g.min === undefined || g.min === null || g.min === '' ? (required ? 1 : 0) : Number(g.min);
    const max = g.max === undefined || g.max === null || g.max === '' ? 1 : Number(g.max);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 1) return { ok: false };
    if (min > max || max > options.length) return { ok: false };
    if (required && min < 1) return { ok: false };
    groups.push({ name, required, min, max, options });
  }
  return { ok: true, groups };
}

/** DB'dagi guruh (Product.modifierGroups — subdocument `_id` lari bilan) */
export interface StoredModifierGroup {
  _id?: unknown;
  name: string;
  required?: boolean;
  min?: number;
  max?: number;
  options: { _id?: unknown; name: string; price: number }[];
}

export type ResolveResult =
  | { ok: true; modifiers: OrderModifier[]; extra: number }
  | { ok: false; reason: 'unknownOption' | 'duplicate' | 'tooFew' | 'tooMany'; group?: string };

/**
 * Tanlangan variant id'lari → modifikatorlar va qo'shimcha narx. Har guruhda tanlovlar soni
 * [min, max] oralig'ida (required → kamida 1). Noma'lum yoki takroriy id — rad.
 */
export function resolveModifiers(groups: readonly StoredModifierGroup[] | null | undefined, optionIds: readonly string[]): ResolveResult {
  const list = groups ?? [];
  const byOption = new Map<string, { group: StoredModifierGroup; option: StoredModifierGroup['options'][number] }>();
  for (const g of list) for (const o of g.options ?? []) if (o._id) byOption.set(String(o._id), { group: g, option: o });

  const seen = new Set<string>();
  const countByGroup = new Map<StoredModifierGroup, number>();
  const modifiers: OrderModifier[] = [];
  let extra = 0;
  for (const id of optionIds) {
    if (seen.has(id)) return { ok: false, reason: 'duplicate' };
    seen.add(id);
    const hit = byOption.get(id);
    if (!hit) return { ok: false, reason: 'unknownOption' };
    countByGroup.set(hit.group, (countByGroup.get(hit.group) ?? 0) + 1);
    const price = Math.max(0, Math.round(hit.option.price || 0));
    modifiers.push({ group: hit.group.name, name: hit.option.name, price });
    extra += price;
  }
  for (const g of list) {
    const n = countByGroup.get(g) ?? 0;
    const min = g.required ? Math.max(1, g.min ?? 1) : Math.max(0, g.min ?? 0);
    const max = Math.max(1, g.max ?? 1);
    if (n < min) return { ok: false, reason: 'tooFew', group: g.name };
    if (n > max) return { ok: false, reason: 'tooMany', group: g.name };
  }
  return { ok: true, modifiers, extra };
}

/** Chek/sotuv qatori nomi: «Osh (Katta, Achchiq)» */
export function itemDisplayName(name: string, modifiers: readonly Pick<OrderModifier, 'name'>[] | null | undefined): string {
  const mods = (modifiers ?? []).map((m) => m.name).filter(Boolean);
  const full = mods.length ? `${name} (${mods.join(', ')})` : name;
  return full.length > 200 ? `${full.slice(0, 199)}…` : full;
}
