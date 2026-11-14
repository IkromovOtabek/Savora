/**
 * Skaner "tanlash" rejimi (/scan?mode=pick) natijasini chaqirgan ekranga qaytarish.
 * Skaner mahsulotni shu yerga qo'yadi va orqaga qaytadi; chaqirgan ekran focus'da oladi.
 */
export interface PickedProduct {
  id: string; name: string; salePrice: number; available: number; trackQuantity: boolean; status: string;
  /** O'lchov birligi: kg/m… bo'lsa miqdor kasr kiritiladi */
  unit?: string | null;
  /** goods | service | bundle — xizmatda qoldiq ko'rsatilmaydi */
  kind?: string;
}

/** Sotuvga qo'yish mumkinmi (kartochkadagi «Sotish» bilan bir xil qoida) */
export const isSellable = (p: Pick<PickedProduct, 'status' | 'available'>) => p.status === 'in_stock' && p.available > 0;

/** Mahsulot tanlangan holda sotuv formasi (/sale-new parametrlari) */
export function saleHref(p: PickedProduct): string {
  const o: Record<string, string | number> = {
    productId: p.id, name: p.name, price: p.salePrice, track: p.trackQuantity ? 1 : 0,
    available: p.available, unit: p.unit ?? '', kind: p.kind ?? 'goods',
  };
  return `/sale-new?${Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}`;
}

let pending: PickedProduct | null = null;

export function putPicked(p: PickedProduct) { pending = p; }
export function takePicked(): PickedProduct | null {
  const p = pending;
  pending = null;
  return p;
}
