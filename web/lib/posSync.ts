import type { Model } from 'mongoose';
import type { IProduct } from './models/tenant/Product';
import type { ISale } from './models/tenant/Sale';
import type { SessionUser } from './session';
import { branchFilter } from './branchScope';
import { reserveStock, releaseStock } from './stock';
import { generateSaleNo } from './sales';
import { recordAudit } from './audit';

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

function isDupKey(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: number }).code === 11000;
}

export async function applyOfflineSale(
  models: { Product: Model<IProduct>; Sale: Model<ISale> },
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

  const qty = product.trackQuantity ? item.qty : 1;
  if (!product.trackQuantity && item.qty !== 1) return { ...base, status: 'rejected', reason: 'badQty' };

  const listTotal = product.salePrice * qty;
  if (product.salePrice > 0 && item.totalAmount < listTotal && !perms.canDiscount) {
    return { ...base, status: 'rejected', reason: 'priceDiscount' };
  }
  if (product.salePrice > 0 && item.totalAmount > listTotal && !perms.canEditPrice) {
    return { ...base, status: 'rejected', reason: 'priceEdit' };
  }

  const soldAt = clampSoldAt(item.soldAt, now);
  const reserved = await reserveStock(Product, product._id, qty, {
    scope,
    set: { soldPaymentType: 'cash' },
    history: { action: 'sold', detail: `${qty} ta · oflayn`, by: user.username, at: soldAt },
  });
  if (!reserved) return { ...base, status: 'conflict', reason: 'outOfStock' };

  try {
    const saleNo = await generateSaleNo(Sale);
    const sale = await Sale.create({
      saleNo,
      productId: product._id,
      productSnapshot: {
        name: product.name,
        imei: product.imei,
        brand: product.brand,
        deviceModel: product.deviceModel,
        purchasePrice: product.purchasePrice,
        saleQuantity: qty,
      },
      branchId: product.branchId,
      paymentType: 'cash',
      totalAmount: item.totalAmount,
      paidAmount: item.totalAmount,
      remainingAmount: 0,
      status: 'paid',
      payments: item.totalAmount > 0
        ? [{ amount: item.totalAmount, paidAt: soldAt, note: "Naqd to'lov", recordedBy: user.username }]
        : [],
      soldBy: user.username,
      notes: item.notes || undefined,
      clientSaleId: item.clientSaleId,
      offline: true,
      syncedAt: now,
      createdAt: soldAt,
    });

    await recordAudit(user, {
      action: 'sale.create',
      entity: 'sale',
      entityId: String(sale._id),
      summary: `Oflayn sotuv ${saleNo}: ${product.name} · ${qty} ta · ${item.totalAmount.toLocaleString('uz-UZ')} so'm (sinxronlandi)`,
      meta: { saleQty: qty, totalAmount: item.totalAmount, paymentType: 'cash', offline: true, soldAt },
    });
    return { ...base, status: 'ok', saleId: String(sale._id), saleNo };
  } catch (err) {
    // Kompensatsiya: sotuv yozilmasa — mahsulot omborga qaytadi
    await releaseStock(Product, product._id, qty);
    if (isDupKey(err)) {
      const dup = await Sale.findOne({ clientSaleId: item.clientSaleId }, { _id: 1, saleNo: 1 }).lean();
      if (dup) return { ...base, status: 'duplicate', saleId: String(dup._id), saleNo: dup.saleNo };
    }
    return { ...base, status: 'rejected', reason: 'failed' };
  }
}
