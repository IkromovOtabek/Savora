import type { IProduct } from './models/tenant/Product';
import { getSoldQty, getStockQty } from './productQuantity';
import { priceTimesQty } from './qty';
import { addQtyByUnit, type QtyByUnit } from './unitTotals';
import { saleProfitRevenue } from './bankCredit';
import type { ISaleBankPart, PaymentType } from './models/tenant/Sale';

export interface FlowLine {
  id: string;
  productId: string;
  name: string;
  branchName: string;
  qty: number;
  /** O'lchov birligi (yo'q — dona) */
  unit?: string | null;
  unitPurchase: number;
  unitSale: number;
  cost: number;
  revenue: number;
  profit: number;
}

export interface FlowTotals {
  /** Miqdor birlik bo'yicha — dona va kg bitta songa qo'shilmaydi */
  stockQty: QtyByUnit;
  soldQty: QtyByUnit;
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
  const cost = priceTimesQty(unitPurchase, qty);
  const revenue = priceTimesQty(unitSale, qty);

  return {
    id: String(p._id),
    productId: p.productId ?? String(p._id).slice(-8).toUpperCase(),
    name: p.name,
    branchName,
    qty,
    unit: p.unit ?? null,
    unitPurchase,
    unitSale,
    cost,
    revenue,
    profit: revenue - cost,
  };
}

interface SaleRow {
  _id: { toString(): string };
  saleNo: string;
  totalAmount?: number;
  productSnapshot?: { name?: string; unit?: string | null; saleQuantity?: number; purchasePrice?: number } | null;
  // Bank krediti ulushi uchun (yo'q bo'lsa — butun summa foydada)
  paymentType?: PaymentType;
  bankName?: string | null;
  bankParts?: ISaleBankPart[] | null;
  paidAmount?: number;
  remainingAmount?: number;
}

/**
 * Chiqim qatori — haqiqiy sotuvdan (Sotildi bilan bir manba): tushum = totalAmount, tannarx = xarid narxi × miqdor.
 * Foyda: bank krediti ulushi kirmaydi — u bankdan pul olinganda jamiga qo'shiladi (`aggregateFlowTotals` bankIn).
 */
export function lineFromSale(s: SaleRow, branchName: string): FlowLine {
  const qty = s.productSnapshot?.saleQuantity ?? 1;
  const unitPurchase = s.productSnapshot?.purchasePrice ?? 0;
  const cost = priceTimesQty(unitPurchase, qty);
  const revenue = s.totalAmount ?? 0;
  return {
    id: String(s._id),
    productId: s.saleNo,
    name: s.productSnapshot?.name ?? '—',
    branchName,
    qty,
    unit: s.productSnapshot?.unit ?? null,
    unitPurchase,
    unitSale: qty > 0 ? Math.round(revenue / qty) : revenue,
    cost,
    revenue,
    profit: (s.paymentType ? saleProfitRevenue({ ...s, paymentType: s.paymentType }) : revenue) - cost,
  };
}

/** `bankIn` — shu filial(lar) kassasiga bankdan olingan pul: bank krediti ulushi foydaga shu bilan kiradi */
export function aggregateFlowTotals(stockLines: FlowLine[], soldLines: FlowLine[], bankIn = 0): FlowTotals {
  const stockQty: QtyByUnit = {};
  let stockCost = 0;
  for (const l of stockLines) {
    addQtyByUnit(stockQty, l.qty, l.unit);
    stockCost += l.cost;
  }
  const soldQty: QtyByUnit = {};
  let soldRevenue = 0;
  let profit = 0;
  for (const l of soldLines) {
    addQtyByUnit(soldQty, l.qty, l.unit);
    soldRevenue += l.revenue;
    profit += l.profit;
  }
  return { stockQty, soldQty, stockCost, soldRevenue, profit: profit + bankIn };
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
