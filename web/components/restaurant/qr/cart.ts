/**
 * Mijoz QR-menyusi savatchasi — sof funksiyalar (DB yo'q, client'da ishlaydi).
 * Narx va modifikator qoidalari serverdagi bilan bir xil: lib/restaurant/modifiers.ts → resolveModifiers,
 * lib/restaurant/bill.ts → itemTotal. Server baribir qayta tekshiradi — bu yerda faqat UI uchun.
 */
import type { PublicMenu } from '@/lib/restaurant/public';
import { itemTotal } from '@/lib/restaurant/bill';
import { RESTAURANT_LIMITS } from '@/lib/restaurant/types';

export type MenuItem = PublicMenu['items'][number];
export type ModGroup = MenuItem['modifierGroups'][number];

export interface CartLine {
  /** Qator kaliti: taom + tanlovlar + izoh (bir xil qator qo'shilsa — miqdori oshadi) */
  key: string;
  productId: string;
  qty: number;
  optionIds: string[];
  note: string;
}

export const MAX_QTY = RESTAURANT_LIMITS.maxQrQty;
export const MAX_LINES = RESTAURANT_LIMITS.maxQrItems;
export const NOTE_MAX = RESTAURANT_LIMITS.noteMax;

/** Guruhdagi tanlovlar oralig'i (resolveModifiers bilan bir xil: required → kamida 1) */
export function groupBounds(g: Pick<ModGroup, 'required' | 'min' | 'max'>): { min: number; max: number } {
  const min = g.required ? Math.max(1, g.min ?? 1) : Math.max(0, g.min ?? 0);
  const max = Math.max(1, g.max ?? 1);
  return { min, max: Math.max(min, max) };
}

/** Birinchi to'ldirilmagan guruh nomi (null — hammasi to'g'ri) */
export function firstInvalidGroup(item: MenuItem, selected: Record<string, string[]>): string | null {
  for (const g of item.modifierGroups) {
    const n = (selected[g.id] ?? []).length;
    const { min, max } = groupBounds(g);
    if (n < min || n > max) return g.name;
  }
  return null;
}

/** Bitta taom narxi: asosiy + tanlangan variantlar */
export function unitPrice(item: MenuItem, optionIds: readonly string[]): number {
  let extra = 0;
  for (const g of item.modifierGroups) for (const o of g.options) if (optionIds.includes(o.id)) extra += Math.max(0, Math.round(o.price || 0));
  return item.price + extra;
}

export function lineTotal(item: MenuItem, line: Pick<CartLine, 'qty' | 'optionIds'>): number {
  return itemTotal({ price: unitPrice(item, line.optionIds), qty: line.qty });
}

/** Tanlangan variant nomlari (menyudagi tartibda) */
export function optionNames(item: MenuItem, optionIds: readonly string[]): string[] {
  const out: string[] = [];
  for (const g of item.modifierGroups) for (const o of g.options) if (optionIds.includes(o.id)) out.push(o.name);
  return out;
}

/** Tanlovni menyudagi tartibda tekis ro'yxatga (kalit va so'rov uchun barqaror) */
export function orderedOptionIds(item: MenuItem, selected: Record<string, string[]>): string[] {
  const out: string[] = [];
  for (const g of item.modifierGroups) {
    const picked = selected[g.id] ?? [];
    for (const o of g.options) if (picked.includes(o.id)) out.push(o.id);
  }
  return out;
}

export function lineKey(productId: string, optionIds: readonly string[], note: string): string {
  return `${productId}|${optionIds.join(',')}|${note.trim()}`;
}

/** Savat tarkibi imzosi — o'zgarsa yangi clientOrderId olinadi (eski kalit bilan boshqa taomlar «takror» deb tashlanmasin) */
export function cartSignature(lines: readonly CartLine[]): string {
  return lines.map((l) => `${l.key}x${l.qty}`).join(';');
}

/** Savatga qator qo'shish: bir xil qator bo'lsa miqdori oshadi (MAX_QTY gacha) */
export function addLine(lines: readonly CartLine[], next: Omit<CartLine, 'key'>): { lines: CartLine[]; capped: boolean; full: boolean } {
  const key = lineKey(next.productId, next.optionIds, next.note);
  const hit = lines.find((l) => l.key === key);
  if (hit) {
    const qty = Math.min(MAX_QTY, hit.qty + next.qty);
    return { lines: lines.map((l) => (l.key === key ? { ...l, qty } : l)), capped: hit.qty + next.qty > MAX_QTY, full: false };
  }
  if (lines.length >= MAX_LINES) return { lines: [...lines], capped: false, full: true };
  const qty = Math.min(MAX_QTY, Math.max(1, Math.floor(next.qty)));
  return { lines: [...lines, { ...next, note: next.note.trim(), qty, key }], capped: next.qty > MAX_QTY, full: false };
}

/**
 * Saqlangan (ishonchsiz) savatni joriy menyuga moslash: menyudan olib tashlangan / stop-listga tushgan taom,
 * noma'lum variant yoki noto'g'ri tanlov — qator tashlanadi. `pruned` — nimadir tashlandimi.
 */
export function sanitizeLines(raw: unknown, items: ReadonlyMap<string, MenuItem>): { lines: CartLine[]; pruned: boolean } {
  if (!Array.isArray(raw)) return { lines: [], pruned: false };
  const out: CartLine[] = [];
  let pruned = false;
  for (const r of raw.slice(0, MAX_LINES) as Partial<CartLine>[]) {
    const item = typeof r?.productId === 'string' ? items.get(r.productId) : undefined;
    const qty = Number(r?.qty);
    const ids = Array.isArray(r?.optionIds) ? r.optionIds.filter((x): x is string => typeof x === 'string') : [];
    const note = typeof r?.note === 'string' ? r.note.slice(0, NOTE_MAX) : '';
    if (!item || !Number.isInteger(qty) || qty < 1) { pruned = true; continue; }
    const selected: Record<string, string[]> = {};
    let unknown = false;
    for (const id of ids) {
      const g = item.modifierGroups.find((x) => x.options.some((o) => o.id === id));
      if (!g) { unknown = true; break; }
      (selected[g.id] ??= []).push(id);
    }
    if (unknown || firstInvalidGroup(item, selected)) { pruned = true; continue; }
    const optionIds = orderedOptionIds(item, selected);
    const res = addLine(out, { productId: item.id, qty: Math.min(MAX_QTY, qty), optionIds, note });
    out.splice(0, out.length, ...res.lines);
  }
  return { lines: out, pruned };
}

/**
 * Buyurtma kaliti (clientOrderId): 8–40 belgi, [A-Za-z0-9_-]. crypto.randomUUID xavfsiz bo'lmagan (http)
 * kontekstda yo'q — getRandomValues bilan UUID v4.
 */
export function newClientOrderId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function luminance(hex: string): number | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const DARK_INK = '#0d1526';

/** Brend rangi ustidagi matn rangi: oq yoki to'q — qaysi biri kontrastliroq bo'lsa (WCAG) */
export function onColor(hex: string): string {
  const l = luminance(hex);
  if (l === null) return '#ffffff';
  const withWhite = 1.05 / (l + 0.05);
  const withDark = (l + 0.05) / ((luminance(DARK_INK) ?? 0) + 0.05);
  return withWhite >= withDark ? '#ffffff' : DARK_INK;
}
