import type { Model } from 'mongoose';
import type { IProduct } from './models/tenant/Product';
import type { ISale } from './models/tenant/Sale';
import type { ICustomer } from './models/tenant/Customer';
import type { SessionUser } from './session';
import { branchFilter } from './branchScope';
import { writeSales, type SaleCustomerSnap } from './sales/createSales';
import { missingPriceRight, type SaleTerms } from './sales/terms';
import { recordAudit } from './audit';
import { isValidQty, priceTimesQty, qtyLabel } from './qty';
import { isStockless } from './productQuantity';
import { resolveSaleCustomer } from './saleCustomer';
import { logError } from './logger';

/**
 * Oflayn POS sinxronlash — mobil ilova internetsiz qilgan NAQD sotuvlarni serverga yozadi.
 *
 * Qoidalar:
 *  - Idempotent: har sotuvda qurilma bergan `clientSaleId` (unikal indeks). Qayta yuborilsa — 'duplicate'
 *    (avvalgi sotuv qaytariladi), ikki marta yozilmaydi; parallel yuborishda ham (E11000 → duplicate).
 *  - Faqat naqd: qarz/nasiya mijoz va kredit tekshiruvini talab qiladi — oflaynda qilinmaydi.
 *  - Ombor ziddiyati: mahsulot shu orada boshqa joyda sotilgan bo'lsa — 'conflict' (sotuv yozilmaydi,
 *    egasi qo'lda hal qiladi: pulni qaytaradi yoki boshqa mahsulotdan sotadi).
 *  - Narx huquqlari onlayn sotuv bilan bir xil (sale.discount / sale.editPrice) — 'rejected'.
 *  - Sotuv vaqti (soldAt) qurilmadan; [hozir − 30 kun, hozir] oralig'iga qisiladi — kunlik kassa va
 *    hisobot sotuv aslida bo'lgan kunga tushadi.
 */
export const OFFLINE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type OfflineSaleInput = {
  clientSaleId: string;
  productId: string;
  qty: number;
  totalAmount: number;
  soldAt: Date;
  notes: string;
  /** Mijoz (yangi ilova): tanlangan id yoki ism + telefon. Yo'q / xato — sotuv mijozsiz yoziladi (rad etilmaydi) */
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
};

export type OfflineSaleStatus = 'ok' | 'duplicate' | 'conflict' | 'rejected';
export type OfflineSaleReason = 'productNotFound' | 'outOfStock' | 'badQty' | 'priceDiscount' | 'priceEdit' | 'failed';

export type OfflineSaleResult = {
  clientSaleId: string;
  status: OfflineSaleStatus;
  saleId?: string;
  saleNo?: string;
  reason?: OfflineSaleReason;
};

type Actor = Pick<SessionUser, 'id' | 'username' | 'role' | 'branchId' | 'dbName'>;

export function clampSoldAt(soldAt: Date, now: Date = new Date()): Date {
  const t = soldAt.getTime();
  if (!Number.isFinite(t) || t > now.getTime()) return now;
  if (t < now.getTime() - OFFLINE_MAX_AGE_MS) return new Date(now.getTime() - OFFLINE_MAX_AGE_MS);
  return soldAt;
}

/** E11000 — lib/dbError (eski import yo'llari uchun shu yerdan ham) */
export { isDupKey } from './dbError';

/** Qurilma bergan sotuv kaliti: UUID yoki shunga o'xshash 8–64 belgili [A-Za-z0-9-] */
export function isClientSaleId(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(v);
}

export async function applyOfflineSale(
  models: { Product: Model<IProduct>; Sale: Model<ISale>; Customer?: Model<ICustomer> },
  user: Actor,
  item: OfflineSaleInput,
  perms: { canDiscount: boolean; canEditPrice: boolean },
  now: Date = new Date(),
): Promise<OfflineSaleResult> {
  const { Product, Sale } = models;
  const base = { clientSaleId: item.clientSaleId };

  const existing = await Sale.findOne({ clientSaleId: item.clientSaleId }, { _id: 1, saleNo: 1 }).lean();
  if (existing) return { ...base, status: 'duplicate', saleId: String(existing._id), saleNo: existing.saleNo };

  const scope = branchFilter(user);
  const product = await Product.findOne({ _id: item.productId, ...scope }).lean();
  if (!product) return { ...base, status: 'rejected', reason: 'productNotFound' };

  // Xizmat/to'plam ham miqdor bilan sotiladi (to'plam — butun son, tarkibini reserveStock tekshiradi)
  const counted = product.trackQuantity || isStockless(product);
  const qty = counted ? item.qty : 1;
  if (!counted && item.qty !== 1) return { ...base, status: 'rejected', reason: 'badQty' };
  // dona — butun, kg/m… — ≤3 xona kasr
  if (!isValidQty(qty, product.kind === 'bundle' ? 'dona' : product.unit)) return { ...base, status: 'rejected', reason: 'badQty' };

  // Narx huquqi — barcha sotuv yo'llari bilan bir qoida (lib/sales/terms)
  const listTotal = priceTimesQty(product.salePrice, qty);
  const right = await missingPriceRight(listTotal, item.totalAmount, product.salePrice > 0, async (k) => (k === 'sale.discount' ? perms.canDiscount : perms.canEditPrice));
  if (right) return { ...base, status: 'rejected', reason: right === 'sale.discount' ? 'priceDiscount' : 'priceEdit' };

  const soldAt = clampSoldAt(item.soldAt, now);

  // Mijoz: sotuv oflaynda allaqachon bo'lgan (pul olingan) — mijoz ma'lumoti xato bo'lsa ham sotuv yoziladi
  let customer: SaleCustomerSnap | null = null;
  if (models.Customer && (item.customerId || (item.customerName && item.customerPhone))) {
    try {
      const r = await resolveSaleCustomer({ Customer: models.Customer }, {
        customerId: item.customerId, name: item.customerName ?? '', phone: item.customerPhone ?? '',
      });
      if (r.ok) customer = r.customer;
    } catch (err) {
      logError('posSync.customer', err);
    }
  }

  // Ombordan ayirish + sotuv yozuvi — sotuv yadrosi (lib/sales/createSales), sotuv vaqti — qurilmadagi vaqt
  const terms: SaleTerms = { paymentType: 'cash', paid: item.totalAmount, bankSplit: false, bankDebt: false, bankNasiya: false };
  const written = await writeSales({ Product, Sale }, user as SessionUser, {
    lines: [{ product, qty, listTotal, total: item.totalAmount, parts: [{ method: 'cash', amount: item.totalAmount }] }],
    terms, customer, clientSaleId: item.clientSaleId, notes: item.notes, at: soldAt,
    productSet: { soldPaymentType: 'cash' },
    stockDetail: () => `${qtyLabel(qty, product.unit)} · oflayn`,
    saleExtra: { offline: true, syncedAt: now },
  });
  if (!written.ok) {
    if ('duplicate' in written) {
      const dup = await Sale.findOne({ clientSaleId: item.clientSaleId }, { _id: 1, saleNo: 1 }).lean();
      if (dup) return { ...base, status: 'duplicate', saleId: String(dup._id), saleNo: dup.saleNo };
    }
    if ('error' in written && written.error.code === 'notEnoughStock') return { ...base, status: 'conflict', reason: 'outOfStock' };
    return { ...base, status: 'rejected', reason: 'failed' };
  }
  const sale = written.sales[0];
  await recordAudit(user, {
    action: 'sale.create',
    entity: 'sale',
    entityId: sale.saleId,
    summary: `Oflayn sotuv ${sale.saleNo}: ${product.name} · ${qtyLabel(qty, product.unit)} · ${item.totalAmount.toLocaleString('uz-UZ')} so'm (sinxronlandi) [offline]`,
    meta: { saleQty: qty, totalAmount: item.totalAmount, paymentType: 'cash', offline: true, soldAt, source: 'offline' },
  });
  return { ...base, status: 'ok', saleId: sale.saleId, saleNo: sale.saleNo };
}
