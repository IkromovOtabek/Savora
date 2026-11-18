/**
 * Ishlab chiqarish sexi (mobil): ishbay — usta/ishchi o'zi uchun yozadi; kirim aktlari — omborchi ko'radi.
 * Server: web/app/api/mobile/production/* (hujjat — web/docs/SEX_API.md §10). Narx serverda texkartadan olinadi,
 * ishchi narx kiritmaydi. Yozuvga `clientId` (UUID) — javob kelmay qayta yuborilsa ikkinchi yozuv tushmaydi.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errMsg } from './api';
import { newClientSaleId } from './offline';
import type { Tone } from '@/components/ui';

/* ───────────────────────────── turlar (server bilan bir xil) ───────────────────────────── */

export type PieceworkStatus = 'logged' | 'approved' | 'rejected' | 'paid';

export interface PieceworkEntry {
  id: string;
  workerId: string;
  workerName: string;
  productionOrderId: string | null;
  productionOrderNo: string | null;
  operation: string;
  qty: number;
  /** Miqdor birligi (aktdagi tayyor mahsulot birligi; dona — butun); aktsiz yozuvda — null */
  unit: string | null;
  rate: number;
  amount: number;
  status: PieceworkStatus;
  workDate: string | null;
  note: string | null;
  rejectReason: string | null;
  createdAt: string | null;
  /** Server: «yozildi» holatida va o'ziniki bo'lsa tuzatish mumkin */
  can?: { edit: boolean };
}

export interface Bucket { count: number; qty: number; amount: number }
export interface PieceworkTotals { logged: Bucket; approved: Bucket; paid: Bucket; due: number }
export interface PieceworkList { items: PieceworkEntry[]; total: number; page: number; limit: number; sums: PieceworkTotals }
export interface PieceworkSummary {
  from: string;
  to: string;
  workers: { workerId: string; workerName: string; logged: Bucket; approved: Bucket; paid: Bucket; due: number; byOperation: { operation: string; qty: number; amount: number }[] }[];
  totals: PieceworkTotals;
}

/** Ishlab chiqarish akti (ro'yxat) — `operations` ishchi tanlovi uchun (narx — 1 birlik) */
export interface ProdOrder {
  id: string;
  docNo: string;
  status: 'draft' | 'in_progress' | 'done' | 'cancelled';
  recipeName: string;
  outputName: string;
  unit: string | null;
  plannedQty: number;
  fromBranchName: string | null;
  operations: { name: string; rate: number }[];
}

export type ReceiptStatus = 'draft' | 'posted' | 'cancelled';

export interface ReceiptSummary {
  id: string;
  docNo: string;
  status: ReceiptStatus;
  supplierName: string | null;
  branchName: string | null;
  purchaseOrderNo: string | null;
  supplierInvoiceNo: string | null;
  lines: number;
  /** Narx ko'rish huquqi bo'lmasa — null */
  total: number | null;
  createdBy: string;
  createdAt: string | null;
  postedAt: string | null;
}

export interface ReceiptLine {
  id: string;
  code: string;
  name: string;
  qty: number;
  unit: string | null;
  factor: number;
  baseQty: number;
  baseUnit: string | null;
  price: number | null;
  amount: number | null;
  priced: boolean;
  expiryDate: string | null;
}

export interface ReceiptView {
  id: string;
  docNo: string;
  status: ReceiptStatus;
  supplierName: string | null;
  branchName: string | null;
  purchaseOrderNo: string | null;
  supplierInvoiceNo: string | null;
  invoiceDate: string | null;
  lines: ReceiptLine[];
  total: number | null;
  paidNow: number | null;
  debt: number | null;
  unpriced: number;
  note: string | null;
  createdBy: string;
  createdAt: string | null;
  postedAt: string | null;
  postedBy: string | null;
  can: { viewPrices: boolean };
}

export interface ListPage<T> { items: T[]; total: number; page: number; limit: number }

/* ───────────────────────────── API ───────────────────────────── */

const qs = (o: Record<string, string | number | undefined | null>) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return p.length ? `?${p.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}` : '';
};

export const productionApi = {
  /** O'z ishbay yozuvlari (`mine=1` — tasdiqlovchi bo'lsa ham faqat o'ziniki) */
  myEntries: (o: { status?: string; from?: string; to?: string; page?: number; limit?: number } = {}) =>
    api<PieceworkList>(`/api/mobile/production/piecework${qs({ mine: 1, ...o })}`),
  /** O'z davr jamlamasi (standart — joriy oy) */
  mySummary: (o: { from?: string; to?: string } = {}) =>
    api<PieceworkSummary>(`/api/mobile/production/piecework${qs({ summary: 1, mine: 1, ...o })}`),
  log: (body: { productionOrderId: string; operation: string; qty: number; clientId: string; workDate?: string; note?: string }) =>
    api<{ entry: PieceworkEntry; existing: boolean }>('/api/mobile/production/piecework', { method: 'POST', body }),
  /** O'z «yozildi» holatidagi yozuvini tuzatish (miqdor; narx serverda texkartadan) */
  edit: (body: { id: string; qty: number }) =>
    api<{ entry: PieceworkEntry }>('/api/mobile/production/piecework', { method: 'PATCH', body }),
  /** Ochiq aktlar (qoralama va jarayonda) */
  activeOrders: () => api<ListPage<ProdOrder>>(`/api/mobile/production/orders${qs({ status: 'active', limit: 100 })}`),
  receipts: (o: { status?: string; q?: string; page?: number; limit?: number } = {}) =>
    api<ListPage<ReceiptSummary>>(`/api/mobile/production/receipts${qs(o)}`),
  receipt: (id: string) => api<{ receipt: ReceiptView }>(`/api/mobile/production/receipts/${encodeURIComponent(id)}`),
};

/** Takroriy yuborishdan himoya kaliti (server: 8–64 belgi, [A-Za-z0-9:_-]) */
export const newPieceworkKey = newClientSaleId;

/* ───────────────────────────── sana chegaralari ───────────────────────────── */

/** Joriy oy boshi (mahalliy 00:00) — ISO */
export function monthStartIso(now = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).toISOString();
}
/**
 * Bugun oxiri (mahalliy 23:59:59.999) — ISO lahza. Server (dateRange) Toshkent yarim tunini «shu kun oxirigacha»
 * suradi, boshqa lahzani aynan o'zi (ichida) oladi — bu qiymat surilmaydi.
 */
export function todayEndIso(now = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
}
export function isSameLocalDay(iso: string | null | undefined, now = new Date()): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/* ───────────────────────────── ko'rinish ───────────────────────────── */

export const PIECEWORK_TONE: Record<PieceworkStatus, Tone> = { logged: 'warn', approved: 'br', paid: 'ok', rejected: 'bad' };
export const RECEIPT_TONE: Record<ReceiptStatus, Tone> = { draft: 'warn', posted: 'ok', cancelled: 'mut' };

/* ───────────────────────────── sahifalangan ro'yxat ───────────────────────────── */

/**
 * `{ items, total, page, limit }` qaytaradigan ro'yxat (usePaged `hasMore` kutadi — bu API'da yo'q).
 * `key` o'zgarsa (filtr/qidiruv) — boshidan; eski javoblar tashlanadi.
 */
export function useListPages<T extends { id: string }>(key: string | null, fetchPage: (page: number) => Promise<ListPage<T>>) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gen = useRef(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'silent') => {
    if (key === null) return;
    const id = ++gen.current;
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    try {
      const r = await fetchRef.current(1);
      if (id !== gen.current) return;
      setItems(r.items); setTotal(r.total); setPage(r.page); setLimit(r.limit); setError(null);
    } catch (e) {
      if (id === gen.current) setError(errMsg(e));
    } finally {
      if (id === gen.current) { setLoading(false); setRefreshing(false); setLoadingMore(false); }
    }
  }, [key]);

  useEffect(() => { load('initial'); }, [load]);

  const hasMore = page * limit < total;
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;
    const id = gen.current;
    setLoadingMore(true);
    try {
      const r = await fetchRef.current(page + 1);
      if (id !== gen.current) return;
      setItems((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        return [...prev, ...r.items.filter((x) => !seen.has(x.id))];
      });
      setTotal(r.total); setPage(r.page); setLimit(r.limit);
    } catch (e) {
      if (id === gen.current) setError(errMsg(e));
    } finally {
      if (id === gen.current) setLoadingMore(false);
    }
  }, [hasMore, loadingMore, loading, page]);

  return {
    items, total, hasMore, loading, refreshing, loadingMore, error, loadMore,
    refresh: useCallback(() => load('refresh'), [load]),
    retry: useCallback(() => load('initial'), [load]),
    reloadSilently: useCallback(() => load('silent'), [load]),
  };
}
