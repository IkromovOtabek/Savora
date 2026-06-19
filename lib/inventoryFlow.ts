import type { IProduct } from './models/tenant/Product';
import { getSoldQty, getStockQty } from './productQuantity';

export interface FlowLine {
  id: string;
  productId: string;
  name: string;
  branchName: string;
  qty: number;
  unitPurchase: number;
  unitSale: number;
  cost: number;
  revenue: number;
  profit: number;
}

export interface FlowTotals {
  stockCount: number;
  soldCount: number;
  stockCost: number;
  soldRevenue: number;
  profit: number;
}

type ProductRow = IProduct & { _id: { toString(): string }; createdAt?: Date; updatedAt?: Date };

export function lineFromProduct(
  p: ProductRow,
  branchName: string,
  kind: 'stock' | 'sold',
): FlowLine | null {
  const qty = kind === 'stock' ? getStockQty(p) : getSoldQty(p);
  if (qty <= 0) return null;

  const unitPurchase = p.purchasePrice ?? 0;
  const unitSale = p.salePrice ?? 0;
  const cost = unitPurchase * qty;
  const revenue = unitSale * qty;

  return {
    id: String(p._id),
    productId: p.productId ?? String(p._id).slice(-8).toUpperCase(),
    name: p.name,
    branchName,
    qty,
    unitPurchase,
    unitSale,
    cost,
    revenue,
    profit: revenue - cost,
  };
}

export function aggregateFlowTotals(stockLines: FlowLine[], soldLines: FlowLine[]): FlowTotals {
  let stockCount = 0;
  let stockCost = 0;
  for (const l of stockLines) {
    stockCount += l.qty;
    stockCost += l.cost;
  }
  let soldCount = 0;
  let soldRevenue = 0;
  let profit = 0;
  for (const l of soldLines) {
    soldCount += l.qty;
    soldRevenue += l.revenue;
    profit += l.profit;
  }
  return { stockCount, soldCount, stockCost, soldRevenue, profit };
}

export interface BranchMonthFlow {
  branchId: string;
  name: string;
  kirimQty: number;
  chiqimQty: number;
  kirimSum: number;
  chiqimSum: number;
  profit: number;
}

export function branchMonthFlow(
  products: ProductRow[],
  branchMap: Record<string, string>,
  start: Date,
  end: Date,
): BranchMonthFlow[] {
  const map = new Map<string, BranchMonthFlow>();

  for (const p of products) {
    const branchId = String(p.branchId);
    const name = branchMap[branchId] ?? '—';
    if (!map.has(branchId)) {
      map.set(branchId, { branchId, name, kirimQty: 0, chiqimQty: 0, kirimSum: 0, chiqimSum: 0, profit: 0 });
    }
    const row = map.get(branchId)!;
    const created = p.createdAt ? new Date(p.createdAt) : null;

    if (created && created >= start && created < end) {
      const qty = p.trackQuantity ? (p.quantity ?? 1) : 1;
      row.chiqimQty += qty;
      row.chiqimSum += (p.purchasePrice ?? 0) * qty;
    }

    const soldQty = getSoldQty(p);
    if (soldQty <= 0) continue;
    const soldAt = p.updatedAt ? new Date(p.updatedAt) : created;
    if (!soldAt || soldAt < start || soldAt >= end) continue;

    row.kirimQty += soldQty;
    row.kirimSum += (p.salePrice ?? 0) * soldQty;
    row.profit += ((p.salePrice ?? 0) - (p.purchasePrice ?? 0)) * soldQty;
  }

  return [...map.values()].sort((a, b) => b.profit - a.profit);
}
