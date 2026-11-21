import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addLine, putLine, setLineQty, removeLine, syncLines, parseStoredCart, mergeLines, cartCount, applyRefusal,
  type CartCard, type CartItem, type OrderRefusal,
} from './marketCartCore';

export type { CartCard, CartItem } from './marketCartCore';

/**
 * Savora Market savati — telefonda (AsyncStorage) saqlanadi, biznes sessiyasidan mustaqil (chiqishda o'chmaydi).
 * Narx va qoldiq savat ekrani ochilganda server bilan moslanadi (sync).
 * Har o'zgarish joriy ro'yxat ref'idan sinxron hisoblanadi — sync() natijani darhol qaytaradi.
 */
const KEY = 'savora_market_cart_v1';

interface MarketCartState {
  items: CartItem[];
  /** Saqlangan savat o'qildi */
  ready: boolean;
  /** Belgidagi son — sotuvdagi tovarlar donasi (kasr birlikdagi qator — 1) */
  count: number;
  qtyOf: (id: string) => number;
  add: (card: CartCard, qty?: number) => void;
  /** Miqdorni aniq o'rnatish, yangi kartochka ma'lumoti bilan (tovar sahifasi); 0 — o'chadi */
  put: (card: CartCard, qty: number) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  /** Server holati bilan moslash; narx/qoldiq/mavjudlik o'zgargan bo'lsa — true */
  sync: (cards: CartCard[]) => boolean;
  /** Buyurtma rad javobi (409 details) bo'yicha qatorni moslash */
  refuse: (r: OrderRefusal) => void;
}

const MarketCartContext = createContext<MarketCartState | null>(null);

export function MarketCartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  const itemsRef = useRef<CartItem[]>([]);
  const readyRef = useRef(false);

  const commit = useCallback((next: CartItem[]) => {
    if (next === itemsRef.current) return;
    itemsRef.current = next;
    setItems(next);
    // O'qib bo'linmaguncha yozmaymiz — saqlangan savat ustidan bo'sh ro'yxat yozilmasin
    if (readyRef.current) AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => { /* xotira yopiq — savat sessiya davomida ishlaydi */ });
  }, []);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY)
      .catch(() => null)
      .then((raw) => {
        if (!alive) return;
        readyRef.current = true;
        // O'qilguncha qo'shilgan tovarlar ham yo'qolmasin
        const merged = mergeLines(parseStoredCart(raw), itemsRef.current);
        itemsRef.current = merged;
        setItems(merged);
        setReady(true);
        if (merged.length) AsyncStorage.setItem(KEY, JSON.stringify(merged)).catch(() => { /* keyingi o'zgarishda */ });
      });
    return () => { alive = false; };
  }, []);

  const add = useCallback((card: CartCard, qty = 1) => commit(addLine(itemsRef.current, card, qty)), [commit]);
  const put = useCallback((card: CartCard, qty: number) => commit(putLine(itemsRef.current, card, qty)), [commit]);
  const setQty = useCallback((id: string, qty: number) => commit(setLineQty(itemsRef.current, id, qty)), [commit]);
  const remove = useCallback((id: string) => commit(removeLine(itemsRef.current, id)), [commit]);
  const clear = useCallback(() => commit([]), [commit]);
  const refuse = useCallback((r: OrderRefusal) => commit(applyRefusal(itemsRef.current, r)), [commit]);
  const sync = useCallback((cards: CartCard[]) => {
    const r = syncLines(itemsRef.current, cards);
    commit(r.items);
    return r.changed;
  }, [commit]);

  const value = useMemo<MarketCartState>(() => ({
    items, ready,
    count: cartCount(items),
    qtyOf: (id) => items.find((x) => x.id === id)?.qty ?? 0,
    add, put, setQty, remove, clear, sync, refuse,
  }), [items, ready, add, put, setQty, remove, clear, sync, refuse]);

  return <MarketCartContext.Provider value={value}>{children}</MarketCartContext.Provider>;
}

export function useMarketCart(): MarketCartState {
  const ctx = useContext(MarketCartContext);
  if (!ctx) throw new Error('useMarketCart MarketCartProvider ichida bo\'lishi kerak');
  return ctx;
}
