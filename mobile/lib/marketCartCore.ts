/**
 * Savora Market savati — SOF hisob (React / React Native importsiz, `node --test` bilan tekshiriladi).
 * Holat va saqlash — `marketCart.tsx`. Qoidalar web (web/components/market/cart.tsx) bilan bir xil:
 * miqdor qoldiqdan oshmaydi, kasr birlik (kg, m…) — 0,1 qadam, qolgani butun son ≥ 1.
 * Buyurtmada server baribir jonli tekshiradi (narx, qoldiq).
 */

/** Katalog kartochkasining savatga kerakli qismi (lib/market.ts ListingCard) */
export interface CartCard {
  id: string;
  name: string;
  price: number;
  priceFrom: boolean;
  image?: string;
  shopName: string;
  shopSlug: string;
  /** Mavjud qoldiq */
  qty: number;
  unit?: string;
  fractional: boolean;
}

export interface CartItem {
  id: string;
  qty: number;
  price: number;
  priceFrom: boolean;
  name: string;
  image?: string;
  shopName: string;
  shopSlug: string;
  unit?: string;
  fractional: boolean;
  /** Mavjud qoldiq (savat ochilganda serverdan yangilanadi); 0 — sotuvda yo'q */
  max: number;
}

export const MAX_LINES = 50;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Stepper qadami: kasr birlikda 0,1, aks holda 1 */
export const qtyStepOf = (fractional: boolean) => (fractional ? 0.1 : 1);
/** Eng kichik miqdor (shundan kam — qator o'chadi) */
export const qtyMinOf = (fractional: boolean) => (fractional ? 0.1 : 1);

/** Miqdorni birlik va qoldiqqa moslash: kasr — 3 xonagacha, butun — pastga; max 0 bo'lsa cheklanmaydi */
export function clampQty(qty: number, max: number, fractional: boolean): number {
  if (!Number.isFinite(qty)) return 0;
  const q = fractional ? round3(qty) : Math.floor(qty);
  return Math.max(0, Math.min(q, max > 0 ? max : q));
}

export function lineFromCard(c: CartCard, qty: number): CartItem {
  return {
    id: c.id, qty, price: c.price, priceFrom: c.priceFrom, name: c.name, image: c.image, shopName: c.shopName,
    shopSlug: c.shopSlug, unit: c.unit, fractional: c.fractional, max: c.qty,
  };
}

/** Savatga qo'shish (bor bo'lsa — miqdor qo'shiladi, kartochka ma'lumoti yangilanadi) */
export function addLine(items: CartItem[], card: CartCard, qty: number): CartItem[] {
  // Qoldig'i yo'q tovar qo'shilmaydi (clampQty uchun max 0 — «cheklanmagan»)
  if (!(card.qty > 0)) return items;
  const cur = items.find((x) => x.id === card.id);
  if (cur) {
    const q = clampQty(cur.qty + qty, card.qty, card.fractional);
    return q > 0 ? items.map((x) => (x.id === card.id ? lineFromCard(card, q) : x)) : items.filter((x) => x.id !== card.id);
  }
  if (items.length >= MAX_LINES) return items;
  const q = clampQty(qty, card.qty, card.fractional);
  return q > 0 ? [...items, lineFromCard(card, q)] : items;
}

const sameLine = (a: CartItem, b: CartItem) =>
  a.qty === b.qty && a.price === b.price && a.max === b.max && a.priceFrom === b.priceFrom && a.name === b.name
  && a.image === b.image && a.unit === b.unit && a.fractional === b.fractional && a.shopName === b.shopName && a.shopSlug === b.shopSlug;

/**
 * Tovar sahifasidan: savatdagi miqdorni ANIQ o'rnatish (qo'shib emas) — yangi kartochka ma'lumoti (qoldiq, narx)
 * bilan. Qator yo'q bo'lsa — qo'shiladi, 0 — o'chadi, hech narsa o'zgarmasa — o'sha ro'yxat qaytadi.
 */
export function putLine(items: CartItem[], card: CartCard, qty: number): CartItem[] {
  const cur = items.find((x) => x.id === card.id);
  const q = card.qty > 0 ? clampQty(qty, card.qty, card.fractional) : 0;
  if (!(q > 0)) return cur ? items.filter((x) => x.id !== card.id) : items;
  const next = lineFromCard(card, q);
  if (cur) return sameLine(cur, next) ? items : items.map((x) => (x.id === card.id ? next : x));
  return items.length >= MAX_LINES ? items : [...items, next];
}

/** Miqdorni o'rnatish; 0 yoki kam bo'lsa — qator o'chadi */
export function setLineQty(items: CartItem[], id: string, qty: number): CartItem[] {
  return items.flatMap((x) => {
    if (x.id !== id) return [x];
    const q = clampQty(qty, x.max, x.fractional);
    return q > 0 ? [{ ...x, qty: q }] : [];
  });
}

/** Buyurtma rad javobi (409 details) — server JONLI bazadan tekshirgan holat */
export interface OrderRefusal { code?: string; listingId?: unknown; available?: unknown; price?: unknown }

/**
 * Rad javobi bo'yicha qatorni darhol moslash (katalog keshi hali eski bo'lishi mumkin — savat qayta so'ralganda
 * eski qoldiq qaytib kelmasligi uchun sync'dan KEYIN qo'llanadi): notEnough — qoldiq/miqdor tushadi,
 * priceChanged — yangi narx, unavailable — sotuvda yo'q.
 */
export function applyRefusal(items: CartItem[], r: OrderRefusal): CartItem[] {
  const id = typeof r.listingId === 'string' ? r.listingId : '';
  if (!id || !items.some((x) => x.id === id)) return items;
  return items.map((x) => {
    if (x.id !== id) return x;
    if (r.code === 'unavailable') return { ...x, max: 0 };
    if (r.code === 'notEnough' && typeof r.available === 'number' && Number.isFinite(r.available)) {
      const max = Math.max(0, r.available);
      const qty = max > 0 ? clampQty(Math.min(x.qty, max), max, x.fractional) : 0;
      return qty > 0 ? { ...x, max, qty } : { ...x, max: 0 };
    }
    if (r.code === 'priceChanged' && typeof r.price === 'number' && r.price > 0) return { ...x, price: r.price };
    return x;
  });
}

export function removeLine(items: CartItem[], id: string): CartItem[] {
  return items.filter((x) => x.id !== id);
}

/**
 * Server javobi (POST /api/market/cart) bilan moslash. Javobda yo'q tovar — sotuvdan olingan (max 0).
 * changed — narx, miqdor yoki mavjudlik o'zgardi (foydalanuvchiga ogohlantirish).
 */
export function syncLines(items: CartItem[], cards: CartCard[]): { items: CartItem[]; changed: boolean } {
  const byId = new Map(cards.map((c) => [c.id, c]));
  let changed = false;
  const next = items.map((x) => {
    const c = byId.get(x.id);
    if (!c || !(c.qty > 0)) {
      if (x.max !== 0) changed = true;
      return { ...x, max: 0 };
    }
    const n = lineFromCard(c, Math.min(x.qty, c.qty));
    if (n.price !== x.price || n.qty !== x.qty || x.max === 0) changed = true;
    return n;
  });
  return { items: next, changed };
}

/** Telefonda saqlangan savatni o'qish — buzilgan yozuvlar tashlanadi */
export function parseStoredCart(raw: string | null): CartItem[] {
  if (!raw) return [];
  try {
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is CartItem =>
        !!x && typeof x === 'object' && typeof (x as CartItem).id === 'string' && typeof (x as CartItem).qty === 'number'
        && (x as CartItem).qty > 0 && typeof (x as CartItem).price === 'number' && typeof (x as CartItem).name === 'string'
        && typeof (x as CartItem).shopSlug === 'string')
      .map((x) => ({ ...x, max: typeof x.max === 'number' ? x.max : x.qty, fractional: !!x.fractional, priceFrom: !!x.priceFrom }))
      .slice(0, MAX_LINES);
  } catch {
    return [];
  }
}

/** Ikki ro'yxatni birlashtirish (saqlangan + o'qib bo'lguncha qo'shilgan): bir xil tovar — keyingisi ustun */
export function mergeLines(base: CartItem[], extra: CartItem[]): CartItem[] {
  const ids = new Set(extra.map((x) => x.id));
  return [...base.filter((x) => !ids.has(x.id)), ...extra].slice(0, MAX_LINES);
}

/**
 * Savat belgisidagi son — sotuvdagi tovarlar DONASI (6 ta qatiq → 6), qatorlar soni emas.
 * Kasr birlikdagi qator (1,5 kg) bitta deb sanaladi.
 */
export function cartCount(items: CartItem[]): number {
  return items.reduce((n, x) => (x.max > 0 ? n + (x.fractional ? 1 : Math.max(1, Math.round(x.qty))) : n), 0);
}
