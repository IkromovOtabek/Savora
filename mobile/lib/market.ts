import { fileUri } from './catalog';

/**
 * Savora Market API turlari (server: web/lib/ecom/catalog.ts, web/lib/ecom/orders.ts) va yordamchilar.
 * Ochiq katalog so'rovlari tokensiz: api(path, { token: null }).
 */

export interface ListingCard {
  id: string;
  name: string;
  price: number;
  /** Nusxalar narxi har xil — eng arzoni ko'rsatiladi («… dan») */
  priceFrom: boolean;
  oldPrice?: number;
  image?: string;
  shopName: string;
  shopSlug: string;
  qty: number;
  unit?: string;
  fractional: boolean;
  category?: string;
}

export interface ListingDetail extends ListingCard {
  description?: string;
  images: string[];
  brand?: string;
}

export interface ListingsResp { items: ListingCard[]; total: number; page: number; pages: number }

export type MarketSort = 'new' | 'cheap' | 'expensive';

export type OrderStatus = 'new' | 'accepted' | 'completed' | 'rejected' | 'cancelled';

export interface OrderItem { listingId: string; name: string; image?: string; price: number; qty: number; unit?: string; total: number }

export interface OrderView {
  id: string;
  orderNo: string;
  shopName: string;
  shopSlug: string;
  status: OrderStatus;
  total: number;
  delivery: 'pickup' | 'delivery';
  address?: string;
  note?: string;
  reason?: string;
  createdAt: string;
  /** Faqat do'kon tomonida */
  buyerName?: string;
  buyerPhone?: string;
  items: OrderItem[];
  history: { status: OrderStatus; at: string }[];
}

/** Serverdagi rasm manzili (nisbiy bo'lishi mumkin) → to'liq URL */
export function imgUri(url?: string | null): string | undefined {
  return url ? fileUri(url) : undefined;
}

/** Chegirma foizi: eski narx joriydan katta bo'lsa */
export function discountPct(price: number, oldPrice?: number | null): number {
  if (!oldPrice || !(oldPrice > price) || !(price > 0)) return 0;
  return Math.max(1, Math.round((1 - price / oldPrice) * 100));
}

/** Kirishdan keyin qaytish manzili — faqat ilova ichidagi Market sahifalari (begona havola emas) */
export function safeNext(v: unknown): string | null {
  return typeof v === 'string' && /^\/market(\/[\w\-/]*)?$/.test(v) ? v : null;
}
