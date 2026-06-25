import { Schema, Types } from 'mongoose';

export type ProductStatus = 'in_stock' | 'sold' | 'reserved' | 'defective' | 'transferred';
export type SoldPaymentType = 'cash' | 'credit';

/** Mahsulot ustida bajarilgan amal turi */
export type ProductActionType =
  | 'created'
  | 'sold'
  | 'transferred'
  | 'returned'
  | 'edited'
  | 'restocked';

export interface IProductHistory {
  action: ProductActionType;
  /** Qo'shimcha matn: filial nomi, narx, izoh */
  detail?: string;
  /** Amalni bajargan foydalanuvchi */
  by?: string;
  at: Date;
}

export interface IProduct {
  productId?: string;
  name: string;
  brand?: string;
  deviceModel?: string;
  imei: string;
  barcode?: string;
  color?: string;
  purchasePrice: number;
  salePrice: number;
  /** Son/miqdor kuzatish */
  trackQuantity: boolean;
  quantity: number;
  soldQuantity: number;
  status: ProductStatus;
  branchId: Types.ObjectId;
  soldPaymentType?: SoldPaymentType;
  soldBankName?: string;
  notes?: string;
  photoUrl?: string;
  createdBy?: string;
  /** Sotilgan sana */
  soldAt?: Date;
  /** Bajarilgan amallar tarixi */
  history?: IProductHistory[];
  createdAt?: Date;
  updatedAt?: Date;
}

const productHistorySchema = new Schema<IProductHistory>(
  {
    action: {
      type: String,
      enum: ['created', 'sold', 'transferred', 'returned', 'edited', 'restocked'],
      required: true,
    },
    detail: { type: String, trim: true },
    by: { type: String, trim: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

export const productSchema = new Schema<IProduct>(
  {
    productId: { type: String, unique: true, sparse: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    brand: { type: String, trim: true },
    deviceModel: { type: String, trim: true },
    imei: { type: String, required: true, unique: true, trim: true, uppercase: true },
    barcode: { type: String, trim: true },
    color: { type: String, trim: true },
    purchasePrice: { type: Number, required: true, min: 0 },
    salePrice: { type: Number, required: true, min: 0 },
    trackQuantity: { type: Boolean, default: false },
    quantity: { type: Number, default: 1, min: 1 },
    soldQuantity: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['in_stock', 'sold', 'reserved', 'defective', 'transferred'],
      default: 'in_stock',
    },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    soldPaymentType: { type: String, enum: ['cash', 'credit'] },
    soldBankName: { type: String, trim: true },
    notes: { type: String, trim: true },
    photoUrl: { type: String, trim: true },
    createdBy: { type: String, trim: true },
    soldAt: { type: Date },
    history: { type: [productHistorySchema], default: [] },
  },
  { timestamps: true, collection: 'products' }
);

productSchema.index({ branchId: 1, status: 1 });
productSchema.index({ barcode: 1 }, { sparse: true });
productSchema.index({ name: 'text', brand: 'text', deviceModel: 'text', imei: 'text' });

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  in_stock: 'Omborda',
  sold: 'Sotilgan',
  reserved: 'Band qilingan',
  defective: 'Nosoz',
  transferred: "Ko'chirilgan",
};

export const PRODUCT_ACTION_LABELS: Record<ProductActionType, string> = {
  created: 'Omborga qo\'shildi',
  sold: 'Sotildi',
  transferred: 'Boshqa filialga berildi',
  returned: 'Omborga qaytarildi',
  edited: 'Ma\'lumotlar tahrirlandi',
  restocked: 'Son to\'ldirildi',
};

export type ProductDoc = IProduct & { _id: Types.ObjectId };
