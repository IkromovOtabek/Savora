import type { IProduct, ProductStatus } from './models/tenant/Product';

export function getStockQty(p: Pick<IProduct, 'trackQuantity' | 'quantity' | 'soldQuantity' | 'status'>): number {
  if (p.trackQuantity) return Math.max(0, (p.quantity ?? 0) - (p.soldQuantity ?? 0));
  return p.status === 'in_stock' ? 1 : 0;
}

export function getSoldQty(p: Pick<IProduct, 'trackQuantity' | 'quantity' | 'soldQuantity' | 'status'>): number {
  if (p.trackQuantity) return p.soldQuantity ?? 0;
  return p.status === 'sold' ? 1 : 0;
}

export function parseQtyField(v: string, fallback = 1): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

export function resolveStatusAfterSale(
  trackQuantity: boolean,
  quantity: number,
  soldQuantity: number,
): ProductStatus {
  if (!trackQuantity) return 'sold';
  return soldQuantity >= quantity ? 'sold' : 'in_stock';
}
