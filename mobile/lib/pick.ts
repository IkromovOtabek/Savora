/**
 * Skaner "tanlash" rejimi (/scan?mode=pick) natijasini chaqirgan ekranga qaytarish.
 * Skaner mahsulotni shu yerga qo'yadi va orqaga qaytadi; chaqirgan ekran focus'da oladi.
 */
export interface PickedProduct {
  id: string; name: string; salePrice: number; available: number; trackQuantity: boolean; status: string;
}

let pending: PickedProduct | null = null;

export function putPicked(p: PickedProduct) { pending = p; }
export function takePicked(): PickedProduct | null {
  const p = pending;
  pending = null;
  return p;
}
