import { Schema, Types } from 'mongoose';
import { PRODUCT_UNITS, type ProductUnit } from '../../businessTypes';

/**
 * Yetkazib beruvchiga buyurtma (xarid) — docs/SEX_API.md.
 * Holatlar: draft → sent → partial → received; draft/sent/partial → cancelled (qisman qabuldan keyin — qolgani yopiladi).
 * Qabul — kirim akti (GoodsReceipt, `purchaseOrderId`) post qilinganda `receivedQty` oshadi va holat qayta hisoblanadi.
 */
export const PO_STATUSES = ['draft', 'sent', 'partial', 'received', 'cancelled'] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export interface IPoLine {
  _id?: Types.ObjectId;
  productId: Types.ObjectId;
  code: string;
  name: string;
  /** Buyurtma miqdori va birligi (asosiy yoki xarid birligi) */
  qty: number;
  unit?: ProductUnit;
  /** 1 birlik = factor asosiy birlik */
  factor: number;
  baseUnit?: ProductUnit;
  /** Kelishilgan narx (shu birlik uchun); yo'q — keyin kirimda kiritiladi */
  price?: number;
  amount?: number;
  /** Qabul qilingan (shu qator birligida) */
  receivedQty: number;
}

export interface IPurchaseOrder {
  /** Z20261118-0001 */
  docNo: string;
  status: PoStatus;
  supplierId: Types.ObjectId;
  supplierName: string;
  /** Qabul qilinadigan ombor */
  branchId: Types.ObjectId;
  lines: IPoLine[];
  total: number;
  expectedAt?: Date;
  note?: string;
  clientId?: string;
  createdBy: string;
  sentAt?: Date;
  sentBy?: string;
  receivedAt?: Date;
  cancelledAt?: Date;
  cancelledBy?: string;
  rev: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const lineSchema = new Schema<IPoLine>({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  qty: { type: Number, required: true, min: 0.001 },
  unit: { type: String, enum: PRODUCT_UNITS },
  factor: { type: Number, default: 1, min: 0.001 },
  baseUnit: { type: String, enum: PRODUCT_UNITS },
  price: { type: Number, min: 0 },
  amount: { type: Number, min: 0 },
  receivedQty: { type: Number, default: 0, min: 0 },
});

export const purchaseOrderSchema = new Schema<IPurchaseOrder>(
  {
    docNo: { type: String, required: true, trim: true },
    status: { type: String, enum: PO_STATUSES, default: 'draft' },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    supplierName: { type: String, required: true, trim: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    lines: { type: [lineSchema], default: [] },
    total: { type: Number, default: 0, min: 0 },
    expectedAt: { type: Date },
    note: { type: String, trim: true, maxlength: 500 },
    clientId: { type: String, trim: true },
    createdBy: { type: String, required: true, trim: true },
    sentAt: { type: Date },
    sentBy: { type: String, trim: true },
    receivedAt: { type: Date },
    cancelledAt: { type: Date },
    cancelledBy: { type: String, trim: true },
    rev: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'purchase_orders' },
);

purchaseOrderSchema.index({ docNo: 1 }, { unique: true });
purchaseOrderSchema.index({ status: 1, createdAt: -1 });
purchaseOrderSchema.index({ supplierId: 1, createdAt: -1 });
purchaseOrderSchema.index({ branchId: 1, createdAt: -1 });
purchaseOrderSchema.index({ clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });

export type PurchaseOrderDoc = IPurchaseOrder & { _id: Types.ObjectId };
