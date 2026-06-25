import { ISale } from './models/tenant/Sale';

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

export function monthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { start, end };
}
