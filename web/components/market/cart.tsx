'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ListingCard } from '@/lib/ecom/catalog';
import { roundQty } from '@/lib/qty';

/**
 * Savat — brauzerda (localStorage). Narx va qoldiq server bilan savat sahifasida yangilanadi
 * (refreshCartAction); buyurtmada server baribir jonli tekshiradi.
 */
export type CartItem = {
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
  /** Mavjud qoldiq (savat sahifasida yangilanadi); 0 — sotuvda yo'q */
  max: number;
};

const KEY = 'savora_market_cart_v1';
const MAX_LINES = 50;

type Ctx = {
  items: CartItem[];
  ready: boolean;
  count: number;
  qtyOf: (id: string) => number;
  add: (card: ListingCard, qty?: number) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  /** Server holati bilan moslash; o'zgarish bo'lsa true */
  sync: (cards: ListingCard[]) => boolean;
};

const CartCtx = createContext<Ctx | null>(null);

function read(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => x && typeof x.id === 'string' && x.qty > 0).slice(0, MAX_LINES) : [];
  } catch {
    return [];
  }
}

function fromCard(c: ListingCard, qty: number): CartItem {
  return {
    id: c.id, qty, price: c.price, priceFrom: c.priceFrom, name: c.name, image: c.image, shopName: c.shopName,
    shopSlug: c.shopSlug, unit: c.unit, fractional: c.fractional, max: c.qty,
  };
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setItems(read());
    setReady(true);
    // Boshqa tabda o'zgarsa
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) setItems(read()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { window.localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* xotira yopiq — savat sessiya davomida ishlaydi */ }
  }, [items, ready]);

  const clampQty = (qty: number, max: number, fractional: boolean) => {
    const q = fractional ? roundQty(qty) : Math.floor(qty);
    return Math.max(0, Math.min(q, max > 0 ? max : q));
  };

  const add = useCallback((card: ListingCard, qty = 1) => {
    setItems((prev) => {
      const cur = prev.find((x) => x.id === card.id);
      if (cur) return prev.map((x) => (x.id === card.id ? { ...fromCard(card, clampQty(x.qty + qty, card.qty, card.fractional)) } : x));
      if (prev.length >= MAX_LINES) return prev;
      return [...prev, fromCard(card, clampQty(qty, card.qty, card.fractional))];
    });
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    setItems((prev) => prev.flatMap((x) => {
      if (x.id !== id) return [x];
      const q = clampQty(qty, x.max, x.fractional);
      return q > 0 ? [{ ...x, qty: q }] : [];
    }));
  }, []);

  const remove = useCallback((id: string) => setItems((prev) => prev.filter((x) => x.id !== id)), []);
  const clear = useCallback(() => setItems([]), []);

  // sync() natijani darhol qaytarishi kerak — joriy holat ref orqali (setState yangilagichi kechikib bajariladi)
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const sync = useCallback((cards: ListingCard[]) => {
    const byId = new Map(cards.map((c) => [c.id, c]));
    let changed = false;
    const next = itemsRef.current.map((x) => {
      const c = byId.get(x.id);
      if (!c) {
        if (x.max !== 0) changed = true;
        return { ...x, max: 0 };
      }
      const n = fromCard(c, Math.min(x.qty, c.qty));
      if (n.price !== x.price || n.qty !== x.qty || x.max === 0) changed = true;
      return n;
    });
    setItems(next);
    return changed;
  }, []);

  const value = useMemo<Ctx>(() => ({
    items, ready,
    count: items.filter((x) => x.max > 0).length,
    qtyOf: (id) => items.find((x) => x.id === id)?.qty ?? 0,
    add, setQty, remove, clear, sync,
  }), [items, ready, add, setQty, remove, clear, sync]);

  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}

export function useCart(): Ctx {
  const c = useContext(CartCtx);
  if (!c) throw new Error('useCart: CartProvider yo\'q');
  return c;
}
