import { Schema, Types } from 'mongoose';
import { PRODUCT_UNITS, type ProductUnit } from '../../businessTypes';

/**
 * Kirim akti (yetkazib beruvchidan tovar qabul qilish) — docs/SEX_API.md. Holatlar: draft → posted; draft → cancelled.
 *
 * «Post» qilinganda: har qator omborga kirim (`branchId`; xarid birligida kiritilgan bo'lsa asosiy birlikka
 * o'giriladi), kelish narxi o'rtacha tortilgan tarzda yangilanadi, yetkazib beruvchi qarziga SupplierEntry
 * (purchase), `paidNow` bo'lsa — SupplierEntry (payment), PO bo'lsa `receivedQty` va holati yangilanadi.
 * Post qilingan aktni qaytarish — keyingi bosqich (hozir: hisobdan chiqarish + yetkazib beruvchi yozuvi).
 */
export const RECEIPT_STATUSES = ['draft', 'posted', 'cancelled'] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

export interface IReceiptLine {
  _id?: Types.ObjectId;
  /** Tanlangan mahsulot hujjati; post qilinganda — kirim bo'lgan hujjat (aktning filialida) */
  productId: Types.ObjectId;
  /** Barqaror kod (Product.itemCode) — boshqa filial hujjati tanlansa shu kod bilan topiladi/yaratiladi */
  code: string;
  name: string;
  /** Kiritilgan miqdor va birlik (asosiy yoki xarid birligi) */
  qty: number;
  unit?: ProductUnit;
  /** 1 kiritilgan birlik = factor asosiy birlik (asosiy birlikda — 1) */
  factor: number;
  /** Omborga tushadigan miqdor (asosiy birlikda) = qty × factor */
  baseQty: number;
  baseUnit?: ProductUnit;
  /** Kiritilgan birlik narxi (so'm). Yo'q — hali kiritilmagan (post qilish uchun shart) */
  price?: number;
  /** Qator summasi = price × qty (butun so'm) */
  amount?: number;
  expiryDate?: Date;
  /** Yetkazib beruvchiga buyurtma qatori (PO bo'yicha qabul) */
  poLineId?: Types.ObjectId;
}

export interface IGoodsReceipt {
  /** K20261118-0001 */
  docNo: string;
  status: ReceiptStatus;
  supplierId?: Types.ObjectId;
  supplierName?: string;
  branchId: Types.ObjectId;
  purchaseOrderId?: Types.ObjectId;
  purchaseOrderNo?: string;
  /** Yetkazib beruvchi nakladnoy/hisob-faktura raqami va sanasi */
  supplierInvoiceNo?: string;
  invoiceDate?: Date;
  lines: IReceiptLine[];
  /** Σ amount (narxi kiritilgan qatorlar) */
  total: number;
  /** Qabul paytida to'langan summa (yetkazib beruvchiga to'lov yozuvi) */
  paidNow: number;
  note?: string;
  clientId?: string;
  createdBy: string;
  postedAt?: Date;
  postedBy?: string;
  cancelledAt?: Date;
  cancelledBy?: string;
  /** Yetkazib beruvchi yozuvlari (SupplierEntry) */
  purchaseEntryId?: Types.ObjectId;
  paymentEntryId?: Types.ObjectId;
  /** Post jarayoni qulfi */
  postingAt?: Date;
  rev: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const lineSchema = new Schema<IReceiptLine>({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  qty: { type: Number, required: true, min: 0.001 },
  unit: { type: String, enum: PRODUCT_UNITS },
  factor: { type: Number, default: 1, min: 0.001 },
  baseQty: { type: Number, required: true, min: 0.001 },
  baseUnit: { type: String, enum: PRODUCT_UNITS },
  price: { type: Number, min: 0 },
  amount: { type: Number, min: 0 },
  expiryDate: { type: Date },
  poLineId: { type: Schema.Types.ObjectId },
});

export const goodsReceiptSchema = new Schema<IGoodsReceipt>(
  {
    docNo: { type: String, required: true, trim: true },
    status: { type: String, enum: RECEIPT_STATUSES, default: 'draft' },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    supplierName: { type: String, trim: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    purchaseOrderId: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder' },
    purchaseOrderNo: { type: String, trim: true },
    supplierInvoiceNo: { type: String, trim: true, maxlength: 60 },
    invoiceDate: { type: Date },
    lines: { type: [lineSchema], default: [] },
    total: { type: Number, default: 0, min: 0 },
    paidNow: { type: Number, default: 0, min: 0 },
    note: { type: String, trim: true, maxlength: 500 },
    clientId: { type: String, trim: true },
    createdBy: { type: String, required: true, trim: true },
    postedAt: { type: Date },
    postedBy: { type: String, trim: true },
    cancelledAt: { type: Date },
    cancelledBy: { type: String, trim: true },
    purchaseEntryId: { type: Schema.Types.ObjectId },
    paymentEntryId: { type: Schema.Types.ObjectId },
    postingAt: { type: Date },
    rev: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'goods_receipts' },
);

goodsReceiptSchema.index({ docNo: 1 }, { unique: true });
goodsReceiptSchema.index({ status: 1, createdAt: -1 });
goodsReceiptSchema.index({ branchId: 1, createdAt: -1 });
goodsReceiptSchema.index({ supplierId: 1, createdAt: -1 });
goodsReceiptSchema.index({ purchaseOrderId: 1 }, { sparse: true });
goodsReceiptSchema.index({ clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });

export type GoodsReceiptDoc = IGoodsReceipt & { _id: Types.ObjectId };
