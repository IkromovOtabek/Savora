/**
 * Ombor hujjatlari (qayta baholash, hisobdan chiqarish) — sof qoidalar. Client va server bir xil ishlatadi.
 */

/** Narxni foizga o'zgartiradi; 1 000 so'mdan katta narxlar 100 so'mgacha yaxlitlanadi */
export function applyPercent(price: number, pct: number): number {
  if (!(price > 0)) return 0;
  const raw = price * (1 + pct / 100);
  const rounded = price >= 1000 ? Math.round(raw / 100) * 100 : Math.round(raw);
  return Math.max(0, rounded);
}

export interface StockState {
  trackQuantity?: boolean;
  quantity?: number;
  soldQuantity?: number;
}

export type WriteOffPlan =
  | { ok: true; set: { quantity?: number; status?: 'sold' | 'defective' } }
  | { ok: false; reason: 'qty' };

/**
 * Hisobdan chiqarishdan keyingi holat:
 *  - dona mahsulot (son yuritilmaydi) → "Nuqsonli" (sotuvdan chiqadi);
 *  - sanaladigan: qisman — quantity kamayadi; butun qoldiq — avval sotilgan bo'lsa "Sotilgan"
 *    (quantity = soldQuantity), umuman sotilmagan bo'lsa butun partiya "Nuqsonli".
 * quantity hech qachon soldQuantity'dan va 1 dan kam bo'lmaydi (sotuv tarixi buzilmasin).
 */
export function planWriteOff(p: StockState, qty: number): WriteOffPlan {
  if (!p.trackQuantity) return qty === 1 ? { ok: true, set: { status: 'defective' } } : { ok: false, reason: 'qty' };
  const quantity = p.quantity ?? 1;
  const sold = p.soldQuantity ?? 0;
  const available = quantity - sold;
  if (!Number.isInteger(qty) || qty < 1 || qty > available) return { ok: false, reason: 'qty' };
  if (qty < available) return { ok: true, set: { quantity: quantity - qty } };
  return sold > 0 ? { ok: true, set: { quantity: sold, status: 'sold' } } : { ok: true, set: { status: 'defective' } };
}
