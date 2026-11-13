import { ISale } from './models/tenant/Sale';
import type { CashFlowType } from './models/tenant/CashFlow';
import { categoryInProfit, type IFinanceCategory } from './models/tenant/FinanceCategory';

export interface PeriodStats {
  salesCount: number;
  revenue: number;
  paid: number;
  debt: number;
  profit: number;
}

export function statsFromSales(sales: (ISale & { productSnapshot: { purchasePrice?: number } })[], start: Date, end: Date): PeriodStats {
  let salesCount = 0;
  let revenue = 0;
  let paid = 0;
  let debt = 0;
  let profit = 0;

  for (const s of sales) {
    if (s.status === 'cancelled') continue;
    const created = new Date(s.createdAt!);
    if (created < start || created >= end) continue;
    salesCount++;
    revenue += s.totalAmount;
    paid += s.paidAmount;
    debt += s.remainingAmount;
    const cost = s.productSnapshot.purchasePrice ?? 0;
    const qty = s.productSnapshot.saleQuantity ?? 1;
    profit += s.totalAmount - cost * qty;
  }

  return { salesCount, revenue, paid, debt, profit };
}

/** Moliya yozuvlarining foydaga ta'sir qiluvchi qismi */
export interface OpexSums {
  /** Boshqa kirimlar (sotuvdan tashqari) */
  income: number;
  /** Xarajatlar */
  expense: number;
}

export interface OpexCategoryRow {
  type: CashFlowType;
  category: string;
  total: number;
}

export interface Opex extends OpexSums {
  /** Filial bo'yicha (branchId → summalar) */
  byBranch: Map<string, OpexSums>;
  /** Filialga bog'lanmagan yozuvlar */
  unbranched: OpexSums;
  /** Toifalar bo'yicha, kattasidan kichigiga */
  byCategory: OpexCategoryRow[];
}

type FlowLike = { type: CashFlowType; amount: number; category?: string | null; branchId?: { toString(): string } | string | null };
type CategoryLike = Pick<IFinanceCategory, 'name' | 'type' | 'system' | 'inProfit'>;

/**
 * Sof foyda uchun kirim/chiqim yozuvlari (sof funksiya — test qilinadi).
 * Faqat foydaga ta'sir qiluvchi toifadagi yozuvlar olinadi: toifasiz eski yozuvlar (ko'pincha filialdan
 * pul olish), kassa operatsiyalari va «Investitsiya» hisobga kirmaydi.
 * Sof foyda = yalpi foyda + income − expense.
 */
export function opexFromFlows(flows: FlowLike[], categories: CategoryLike[]): Opex {
  const counted = new Set(categories.filter(categoryInProfit).map((c) => `${c.type}:${c.name}`));
  const byBranch = new Map<string, OpexSums>();
  const unbranched: OpexSums = { income: 0, expense: 0 };
  const byCat = new Map<string, OpexCategoryRow>();
  let income = 0;
  let expense = 0;

  for (const f of flows) {
    const category = f.category?.trim();
    if (!category || !(f.amount > 0)) continue;
    const key = `${f.type}:${category}`;
    if (!counted.has(key)) continue;

    const branchId = f.branchId ? String(f.branchId) : null;
    let sums = unbranched;
    if (branchId) {
      sums = byBranch.get(branchId) ?? { income: 0, expense: 0 };
      byBranch.set(branchId, sums);
    }
    sums[f.type] += f.amount;
    if (f.type === 'income') income += f.amount;
    else expense += f.amount;

    const row = byCat.get(key) ?? { type: f.type, category, total: 0 };
    row.total += f.amount;
    byCat.set(key, row);
  }

  const byCategory = [...byCat.values()].sort((a, b) => b.total - a.total);
  return { income, expense, byBranch, unbranched, byCategory };
}

export function monthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { start, end };
}
