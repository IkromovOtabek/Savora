import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, ApiError } from './api';
import type { PickedProduct } from './pick';
import { addQty, roundQty } from './qty';

/**
 * Oflayn POS — internet yo'qligida NAQD sotuv.
 *
 *  - Katalog: filial omboridagi sotuvga tayyor mahsulotlar qurilmada saqlanadi
 *    (GET /api/mobile/pos/catalog). Oflayn sotuvda shu ro'yxatdan tanlanadi va
 *    qoldiq qurilmada kamaytiriladi (bir donani ikki marta sotib qo'ymaslik uchun).
 *  - Navbat: oflayn sotuvlar `clientSaleId` (noyob kalit) bilan saqlanadi.
 *  - Sinxron: POST /api/mobile/pos/sync — server idempotent: bir sotuv ikki marta yozilmaydi.
 *    ok/duplicate → navbatdan o'chadi; conflict/rejected → foydalanuvchi ko'radi va hal qiladi.
 *
 * Ma'lumot foydalanuvchi bo'yicha alohida kalitda (boshqa login bilan aralashmaydi).
 */

export interface CatalogItem {
  id: string;
  name: string;
  kind?: string;
  imei: string;
  barcode: string | null;
  salePrice: number;
  trackQuantity: boolean;
  available: number;
  /** O'lchov birligi (kg/m… — qoldiq va sotuv miqdori kasr bo'lishi mumkin) */
  unit?: string | null;
}

export interface Catalog {
  savedAt: string;
  truncated: boolean;
  items: CatalogItem[];
}

export type QueueStatus = 'pending' | 'conflict' | 'rejected';
export type QueueReason = 'productNotFound' | 'outOfStock' | 'badQty' | 'priceDiscount' | 'priceEdit' | 'failed';

export interface QueuedSale {
  clientSaleId: string;
  productId: string;
  name: string;
  qty: number;
  unit?: string | null;
  totalAmount: number;
  soldAt: string;
  notes: string;
  status: QueueStatus;
  reason?: QueueReason;
}

export interface SyncReport {
  sent: number;
  ok: number;
  problems: number;
}

const catalogKey = (userId: string) => `savora_pos_catalog:${userId}`;
const queueKey = (userId: string) => `savora_pos_queue:${userId}`;
const SYNC_BATCH = 100;

/** Noyob kalit — UUID mavjud bo'lsa u, aks holda vaqt + tasodifiy (to'qnashuv ehtimoli amalda nol) */
export function newClientSaleId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const rnd = () => Math.random().toString(16).slice(2, 10).padEnd(8, '0');
  return `${Date.now().toString(16)}-${rnd()}-${rnd()}-${rnd()}`;
}

/** Tarmoq xatosi (server javob bermadi) — oflayn rejimga o'tish belgisi */
export function isNetworkError(e: unknown): boolean {
  return e instanceof ApiError && e.status === 0;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch { /* xotira to'la — keyingi urinishda */ }
}

// ── Katalog ──────────────────────────────────────────────────────────────
export async function loadCatalog(userId: string): Promise<Catalog | null> {
  return readJson<Catalog | null>(catalogKey(userId), null);
}

/** Serverdan yangilaydi; navbatdagi (hali yuborilmagan) sotuvlar qoldiqdan ayriladi */
export async function refreshCatalog(userId: string): Promise<Catalog> {
  const r = await api<{ serverTime: string; truncated: boolean; items: CatalogItem[] }>('/api/mobile/pos/catalog', { timeoutMs: 20000 });
  const queue = await loadQueue(userId);
  const items = applyPendingToStock(r.items, queue);
  const cat: Catalog = { savedAt: r.serverTime || new Date().toISOString(), truncated: r.truncated, items };
  await writeJson(catalogKey(userId), cat);
  return cat;
}

/** Navbatdagi sotuvlar qoldiqni kamaytiradi (server katalogi ularni hali bilmaydi) */
export function applyPendingToStock(items: CatalogItem[], queue: QueuedSale[]): CatalogItem[] {
  const used = new Map<string, number>();
  for (const s of queue) if (s.status === 'pending') used.set(s.productId, addQty(used.get(s.productId) ?? 0, s.qty));
  return items.map((p) => {
    const u = used.get(p.id);
    return u ? { ...p, available: Math.max(0, roundQty(p.available - u)) } : p;
  });
}

/** Katalogdan qidiruv: nom, IMEI/kod yoki shtrix-kod bo'yicha */
export function searchCatalog(cat: Catalog | null, q: string, limit = 60): CatalogItem[] {
  if (!cat) return [];
  const t = q.trim().toLowerCase();
  const tn = t.replace(/\s/g, '');
  const list = !t
    ? cat.items
    : cat.items.filter((p) =>
        p.name.toLowerCase().includes(t) || p.imei.toLowerCase().includes(tn) || (p.barcode ?? '').toLowerCase().includes(tn));
  return list.slice(0, limit);
}

/** Skaner kodi bo'yicha aniq mos (IMEI yoki shtrix) */
export function findByCode(cat: Catalog | null, code: string): CatalogItem | null {
  if (!cat) return null;
  const norm = code.replace(/\s/g, '').toUpperCase();
  return cat.items.find((p) => p.imei.toUpperCase() === norm || p.barcode === code.trim()) ?? null;
}

export function toPicked(p: CatalogItem): PickedProduct {
  return { id: p.id, name: p.name, salePrice: p.salePrice, available: p.available, trackQuantity: p.trackQuantity, status: p.available > 0 ? 'in_stock' : 'sold', unit: p.unit ?? null, kind: p.kind };
}

// ── Navbat ───────────────────────────────────────────────────────────────
export async function loadQueue(userId: string): Promise<QueuedSale[]> {
  return readJson<QueuedSale[]>(queueKey(userId), []);
}

async function saveQueue(userId: string, q: QueuedSale[]): Promise<void> {
  await writeJson(queueKey(userId), q);
}

/** Oflayn sotuvni navbatga qo'shadi va katalogdagi qoldiqni kamaytiradi */
export async function enqueueSale(
  userId: string,
  sale: Omit<QueuedSale, 'clientSaleId' | 'soldAt' | 'status'>,
): Promise<QueuedSale> {
  const item: QueuedSale = { ...sale, clientSaleId: newClientSaleId(), soldAt: new Date().toISOString(), status: 'pending' };
  const q = await loadQueue(userId);
  q.push(item);
  await saveQueue(userId, q);

  const cat = await loadCatalog(userId);
  if (cat) {
    cat.items = cat.items.map((p) => (p.id === sale.productId ? { ...p, available: Math.max(0, roundQty(p.available - sale.qty)) } : p));
    await writeJson(catalogKey(userId), cat);
  }
  return item;
}

/** Ziddiyatli/rad etilgan yozuvni ro'yxatdan olib tashlash (egasi hal qilgach) */
export async function dismissQueued(userId: string, clientSaleId: string): Promise<void> {
  const q = await loadQueue(userId);
  await saveQueue(userId, q.filter((s) => s.clientSaleId !== clientSaleId || s.status === 'pending'));
}

// Bir vaqtda faqat bitta sinxron (ilova fokus + taymer + tugma bir paytda chaqirishi mumkin)
let syncing: Promise<SyncReport> | null = null;

export function syncQueue(userId: string): Promise<SyncReport> {
  if (!syncing) syncing = doSync(userId).finally(() => { syncing = null; });
  return syncing;
}

async function doSync(userId: string): Promise<SyncReport> {
  const report: SyncReport = { sent: 0, ok: 0, problems: 0 };
  for (;;) {
    const q = await loadQueue(userId);
    const batch = q.filter((s) => s.status === 'pending').slice(0, SYNC_BATCH);
    if (batch.length === 0) break;

    // Tarmoq xatosi bo'lsa — tashlanadi (navbat o'zgarmaydi, keyinroq qayta uriniladi)
    const r = await api<{ results: { clientSaleId: string; status: string; reason?: QueueReason }[] }>('/api/mobile/pos/sync', {
      method: 'POST',
      timeoutMs: 30000,
      body: {
        sales: batch.map((s) => ({
          clientSaleId: s.clientSaleId, productId: s.productId, qty: s.qty,
          totalAmount: s.totalAmount, soldAt: s.soldAt, notes: s.notes,
        })),
      },
    });
    report.sent += batch.length;

    const byId = new Map(r.results.map((x) => [x.clientSaleId, x]));
    // Yuborish paytida yangi sotuv qo'shilgan bo'lishi mumkin — navbatni qayta o'qib birlashtiramiz
    const fresh = await loadQueue(userId);
    const next: QueuedSale[] = [];
    for (const s of fresh) {
      const res = byId.get(s.clientSaleId);
      if (!res) { next.push(s); continue; }
      if (res.status === 'ok' || res.status === 'duplicate') { report.ok++; continue; }
      report.problems++;
      next.push({ ...s, status: res.status === 'conflict' ? 'conflict' : 'rejected', reason: res.reason });
    }
    await saveQueue(userId, next);
    if (byId.size === 0) break; // server hech narsa qaytarmadi — cheksiz aylanmaslik uchun
  }
  return report;
}
