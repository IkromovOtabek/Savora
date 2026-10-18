import { Schema, Types } from 'mongoose';

/** Ombor hujjati turi: narxni qayta baholash yoki hisobdan chiqarish */
export type StockAdjustmentType = 'revaluation' | 'writeoff';
export type WriteOffReason = 'defective' | 'lost' | 'expired' | 'other';

export interface IStockAdjustmentItem {
  productId: Types.ObjectId;
  name: string;
  /** Qayta baholash: eski/yangi narxlar */
  oldSalePrice?: number;
  newSalePrice?: number;
  oldWholesalePrice?: number;
  newWholesalePrice?: number;
  /** Hisobdan chiqarish: soni va kelish narxi (zarar = qty × purchasePrice) */
  qty?: number;
  purchasePrice?: number;
}

/**
 * Ombor hujjati — bitta amalda bir nechta mahsulot. Mahsulot tarixiga ham yoziladi
 * (revalued / writtenOff); hujjat esa umumiy tarix va zarar hisobi uchun.
 */
export interface IStockAdjustment {
  /** QB-0001 (qayta baholash) / HC-0001 (hisobdan chiqarish) */
  docNo: string;
  type: StockAdjustmentType;
  reason?: WriteOffReason;
  note?: string;
  items: IStockAdjustmentItem[];
  /** Hisobdan chiqarishda umumiy zarar (kelish narxida) */
  totalCost: number;
  by: string;
  /** Filial login bajargan bo'lsa — uning filiali */
  branchId?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

const itemSchema = new Schema<IStockAdjustmentItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true, trim: true },
    oldSalePrice: { type: Number, min: 0 },
    newSalePrice: { type: Number, min: 0 },
    oldWholesalePrice: { type: Number, min: 0 },
    newWholesalePrice: { type: Number, min: 0 },
    qty: { type: Number, min: 1 },
    purchasePrice: { type: Number, min: 0 },
  },
  { _id: false }
);

export const stockAdjustmentSchema = new Schema<IStockAdjustment>(
  {
    docNo: { type: String, required: true, trim: true },
    type: { type: String, enum: ['revaluation', 'writeoff'], required: true },
    reason: { type: String, enum: ['defective', 'lost', 'expired', 'other'] },
    note: { type: String, trim: true, maxlength: 300 },
    items: { type: [itemSchema], required: true },
    totalCost: { type: Number, default: 0, min: 0 },
    by: { type: String, required: true, trim: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true, collection: 'stock_adjustments' }
);

stockAdjustmentSchema.index({ docNo: 1 }, { unique: true });
stockAdjustmentSchema.index({ type: 1, createdAt: -1 });
stockAdjustmentSchema.index({ branchId: 1, createdAt: -1 });

export type StockAdjustmentDoc = IStockAdjustment & { _id: Types.ObjectId };
