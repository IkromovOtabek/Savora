/**
 * Ombor hujjatlari (qayta baholash, hisobdan chiqarish) — sof qoidalar. Client va server bir xil ishlatadi.
 */
import { isValidQty, roundQty } from './qty';

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
  /** O'lchov birligi: kg/m… — kasr miqdor (≤3 xona), aks holda butun */
  unit?: string | null;
}

export type WriteOffPlan =
  | { ok: true; set: { quantity?: number; status?: 'sold' | 'defective' } }
  | { ok: false; reason: 'qty' };

/**
 * Hisobdan chiqarishdan keyingi holat:
 *  - dona mahsulot (son yuritilmaydi) → "Nuqsonli" (sotuvdan chiqadi);
 *  - sanaladigan: qisman — quantity kamayadi; butun qoldiq — avval sotilgan bo'lsa "Sotilgan"
 *    (quantity = soldQuantity), umuman sotilmagan bo'lsa butun partiya "Nuqsonli".
 * quantity hech qachon soldQuantity'dan kam va 0 bo'lmaydi (sotuv tarixi buzilmasin).
 * Kasrli birlikda (kg, m…) qisman chiqarish mumkin: 10 kg dan 2.5 kg → 7.5 kg.
 */
export function planWriteOff(p: StockState, qty: number): WriteOffPlan {
  if (!p.trackQuantity) return qty === 1 ? { ok: true, set: { status: 'defective' } } : { ok: false, reason: 'qty' };
  const quantity = p.quantity ?? 1;
  const sold = p.soldQuantity ?? 0;
  const available = roundQty(quantity - sold);
  if (!isValidQty(qty, p.unit) || qty > available) return { ok: false, reason: 'qty' };
  if (qty < available) return { ok: true, set: { quantity: roundQty(quantity - qty) } };
  return sold > 0 ? { ok: true, set: { quantity: sold, status: 'sold' } } : { ok: true, set: { status: 'defective' } };
}

export type WriteOffUndoPlan =
  | { ok: true; filter: Record<string, unknown>; update: Record<string, unknown> }
  | { ok: false };

/**
 * Hisobdan chiqarishni bekor qilish — `planWriteOff` ning teskarisi (hozirgi holatdan):
 *  - dona (son yuritilmaydi) yoki butun partiya «Nuqsonli» bo'lgan — holat yana «Sotuvda»;
 *  - sanaladigan: quantity qty ga ortadi, holat «Sotuvda» (butun qoldiq chiqib «Sotilgan» bo'lgan bo'lsa ham).
 * `filter` — optimistik shart: shu orada holat o'zgargan bo'lsa yangilanmaydi.
 */
export function planWriteOffUndo(p: StockState & { status?: string }, qty: number): WriteOffUndoPlan {
  if (!p.trackQuantity) {
    if (p.status !== 'defective') return { ok: false };
    return { ok: true, filter: { status: 'defective', trackQuantity: { $ne: true } }, update: { $set: { status: 'in_stock' } } };
  }
  if (p.status === 'defective') {
    return { ok: true, filter: { status: 'defective', trackQuantity: true, quantity: p.quantity }, update: { $set: { status: 'in_stock' } } };
  }
  if (p.status !== 'in_stock' && p.status !== 'sold') return { ok: false };
  return {
    ok: true,
    filter: { status: p.status, trackQuantity: true, quantity: p.quantity, soldQuantity: p.soldQuantity },
    update: { $set: { quantity: roundQty((p.quantity ?? 1) + qty), status: 'in_stock' } },
  };
}
