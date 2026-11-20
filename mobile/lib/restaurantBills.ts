/**
 * Stollar ekranidagi «Hisoblar» ko'rinishi — sof funksiyalar (React Native importi yo'q; tests/restaurantBills.test.mjs).
 * Web lib/restaurant/bills.ts nusxasi (mobil web kodini import qila olmaydi) — qoida bir xil:
 *  - faqat ochib ko'ra oladigan (`access`) hisoblar;
 *  - saboy bog'langan stolda (`forTableId`) ko'rinadigan ochiq hisob bo'lsa — o'sha stol ostida, bo'lmasa alohida;
 *  - tartib: pre-chek yoki mijoz QR'dan hisob so'ragan — birinchi, keyin eng eskisi (ochilgan vaqt).
 */
import type { OrderSummary, TableRow } from './restaurant';

export interface BillRow {
  /** Asosiy hisob: stoldagi buyurtma yoki (stoli ko'rinmaydigan) saboy */
  order: OrderSummary;
  tableId: string | null;
  /** Stol raqami (saboyda — bog'langan stol) */
  tableNumber: number | null;
  /** Mijoz QR orqali hisob so'ragan vaqt */
  billAt: string | null;
  /** Shu stolga bog'langan ochiq saboylar (eskisi birinchi) */
  linked: OrderSummary[];
}

export interface BillsSummary { count: number; due: number; precheck: number; billRequests: number }

const byOpened = (a: OrderSummary, b: OrderSummary) =>
  String(a.openedAt ?? '').localeCompare(String(b.openedAt ?? '')) || a.orderNo.localeCompare(b.orderNo);

/** Ko'rinadigan ochiq saboylar stol bo'yicha (stol plitkasidagi «+N saboy») */
export function linkedTakeaways(board: { takeaway: OrderSummary[] }): Map<string, OrderSummary[]> {
  const map = new Map<string, OrderSummary[]>();
  for (const o of board.takeaway) {
    if (!o.access || !o.forTableId) continue;
    const list = map.get(o.forTableId);
    if (list) list.push(o);
    else map.set(o.forTableId, [o]);
  }
  for (const list of map.values()) list.sort(byOpened);
  return map;
}

/** 0 — pre-chek / hisob so'ragan (birinchi), 1 — qolganlari */
export function billRank(row: Pick<BillRow, 'order' | 'linked' | 'billAt'>): 0 | 1 {
  if (row.billAt) return 0;
  return row.order.status === 'precheck' || row.linked.some((o) => o.status === 'precheck') ? 0 : 1;
}

export function buildBills(board: { tables: TableRow[]; takeaway: OrderSummary[] }): { rows: BillRow[]; summary: BillsSummary } {
  const linked = linkedTakeaways(board);
  const rows: BillRow[] = [];
  const attached = new Set<string>();
  for (const t of board.tables) {
    if (!t.order || !t.order.access) continue;
    const kids = linked.get(t.id) ?? [];
    for (const k of kids) attached.add(k.id);
    rows.push({ order: t.order, tableId: t.id, tableNumber: t.number, billAt: t.calls.billAt, linked: kids });
  }
  for (const o of board.takeaway) {
    if (!o.access || attached.has(o.id)) continue;
    rows.push({ order: o, tableId: o.forTableId, tableNumber: o.forTableNumber, billAt: null, linked: [] });
  }
  rows.sort((a, b) =>
    billRank(a) - billRank(b)
    || byOpened(a.order, b.order)
    || (a.tableNumber ?? Number.MAX_SAFE_INTEGER) - (b.tableNumber ?? Number.MAX_SAFE_INTEGER));
  const summary: BillsSummary = { count: 0, due: 0, precheck: 0, billRequests: 0 };
  for (const r of rows) {
    if (r.billAt) summary.billRequests += 1;
    for (const o of [r.order, ...r.linked]) {
      summary.count += 1;
      summary.due += o.due ?? 0;
      if (o.status === 'precheck') summary.precheck += 1;
    }
  }
  return { rows, summary };
}
