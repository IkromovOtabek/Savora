/**
 * Stollar taxtasidagi «Hisoblar» ko'rinishi va kassir navbati — sof funksiyalar (DB importi yo'q: client va testlar).
 * Manba — `queries.tablesBoard` javobi (stoldagi ochiq buyurtmalar + saboylar). Kirish qoidasi saqlanadi: faqat
 * foydalanuvchi ochib ko'ra oladigan (`access`) hisoblar. Saboy bog'langan stolda (`forTableId`) ko'rinadigan ochiq
 * hisob bo'lsa — o'sha stol qatori ostida, bo'lmasa alohida qator. Mobil nusxasi — mobile/lib/restaurantBills.ts.
 */
import type { TablesBoard } from './queries';
import type { OrderSummary } from './view';

export interface BillRow {
  /** Asosiy hisob: stoldagi buyurtma yoki (stoli ochiq bo'lmagan) saboy */
  order: OrderSummary;
  /** Stoldagi hisob — o'z stoli; saboy — bog'langan stol (bo'lsa) */
  tableId: string | null;
  tableNumber: number | null;
  hallId: string | null;
  /** Mijoz QR orqali hisob so'ragan vaqt (stol; «Ko'rdim» bosilgach o'chadi) */
  billAt: string | null;
  /** Shu stolga bog'langan ochiq saboylar (eskisi birinchi) */
  linked: OrderSummary[];
}

export interface BillsSummary {
  /** Ochiq hisoblar soni (stol + saboy, bog'langan saboylar ham) */
  count: number;
  /** To'lanadigan umumiy summa (so'm) */
  due: number;
  /** Pre-chek chiqqan — to'lovni kutayotgan hisoblar */
  precheck: number;
  /** Mijoz QR'dan hisob so'ragan stollar */
  billRequests: number;
}

type BoardLike = Pick<TablesBoard, 'tables' | 'takeaway'>;

const byOpened = (a: OrderSummary, b: OrderSummary) =>
  String(a.openedAt ?? '').localeCompare(String(b.openedAt ?? '')) || a.orderNo.localeCompare(b.orderNo);

/** Ko'rinadigan ochiq saboylar stol bo'yicha (stol kartochkasidagi «+ saboy N · summa») */
export function linkedTakeaways(board: Pick<TablesBoard, 'takeaway'>): Map<string, OrderSummary[]> {
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

/** Bog'langan saboylar jamlamasi: soni va to'lanadigan summa */
export function linkedTotals(list: readonly OrderSummary[] | undefined): { count: number; due: number } | null {
  if (!list?.length) return null;
  return { count: list.length, due: list.reduce((s, o) => s + (o.due ?? 0), 0) };
}

/** Navbatdagi o'rni: 0 — pre-chek chiqqan yoki mijoz hisob so'ragan (birinchi), 1 — qolganlari */
export function billRank(row: Pick<BillRow, 'order' | 'linked' | 'billAt'>): 0 | 1 {
  if (row.billAt) return 0;
  return row.order.status === 'precheck' || row.linked.some((o) => o.status === 'precheck') ? 0 : 1;
}

/**
 * Hisoblar ro'yxati: pre-chek / hisob so'ragan birinchi, keyin eng eskisi (ochilgan vaqt bo'yicha).
 * Bog'langan saboylar stol qatori ostida; jamlama — barcha ko'rinadigan ochiq hisoblar bo'yicha.
 */
export function buildBills(board: BoardLike): { rows: BillRow[]; summary: BillsSummary } {
  const linked = linkedTakeaways(board);
  const rows: BillRow[] = [];
  const attached = new Set<string>();
  for (const t of board.tables) {
    if (!t.order?.access) continue;
    const kids = linked.get(t.id) ?? [];
    for (const k of kids) attached.add(k.id);
    rows.push({ order: t.order, tableId: t.id, tableNumber: t.number, hallId: t.hallId, billAt: t.calls.billAt, linked: kids });
  }
  const hallOf = new Map(board.tables.map((t) => [t.id, t.hallId]));
  for (const o of board.takeaway) {
    if (!o.access || attached.has(o.id)) continue;
    rows.push({
      order: o,
      tableId: o.forTableId,
      tableNumber: o.forTableNumber,
      hallId: o.forTableId ? hallOf.get(o.forTableId) ?? null : null,
      billAt: null,
      linked: [],
    });
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

/** Buyurtma raqamining qisqa qismi: «B20261120-0042» → «0042» */
export function shortOrderNo(orderNo: string): string {
  return orderNo.split('-').pop() ?? orderNo;
}

/**
 * Qidiruv (kassir): raqam — stol raqami boshlanishi (5 → 5, 50–59) yoki saboy raqami (42 → №0042);
 * matn — ofitsant ismi. Bog'langan saboylar ham hisobga olinadi.
 */
export function billMatches(row: BillRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const all = [row.order, ...row.linked];
  if (/^\d+$/.test(q)) {
    if (row.tableNumber !== null && String(row.tableNumber).startsWith(q)) return true;
    return all.some((o) => String(Number(shortOrderNo(o.orderNo)) || '').startsWith(q));
  }
  return all.some((o) => (o.waiterName ?? '').toLowerCase().includes(q));
}
