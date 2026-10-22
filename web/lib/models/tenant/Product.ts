import { Schema, Types } from 'mongoose';
import { softDeletePlugin } from '../../softDelete';
import { PRODUCT_UNITS, type ProductUnit } from '../../businessTypes';

export type ProductStatus = 'in_stock' | 'sold' | 'reserved' | 'defective' | 'transferred';
export type SoldPaymentType = 'cash' | 'credit';

/** Mahsulot ustida bajarilgan amal turi */
export type ProductActionType =
  | 'created'
  | 'sold'
  | 'transferred'
  | 'returned'
  | 'edited'
  | 'restocked'
  | 'revalued'
  | 'writtenOff';

export interface IProductHistory {
  action: ProductActionType;
  /** Qo'shimcha matn: filial nomi, narx, izoh */
  detail?: string;
  /** Amalni bajargan foydalanuvchi */
  by?: string;
  at: Date;
}

/**
 * Mahsulot turi:
 *  - goods   — oddiy tovar (qoldig'i bor);
 *  - service — xizmat: qoldig'i yo'q, sotilganda ombor o'zgarmaydi, ro'yxatda qoladi;
 *  - bundle  — to'plam: o'z qoldig'i yo'q, sotilganda tarkibidagi tovarlar ombordan ayriladi.
 */
export const PRODUCT_KINDS = ['goods', 'service', 'bundle'] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

/** To'plam tarkibi: shu filialdagi sanaladigan tovar va 1 to'plamdagi miqdori */
export interface IBundleItem {
  productId: Types.ObjectId;
  qty: number;
}

export interface IProduct {
  productId?: string;
  /** Yo'q bo'lsa — 'goods' (eski yozuvlar) */
  kind?: ProductKind;
  bundleItems?: IBundleItem[];
  name: string;
  brand?: string;
  deviceModel?: string;
  imei: string;
  barcode?: string;
  color?: string;
  purchasePrice: number;
  salePrice: number;
  /** Eski narx (chegirma ko'rsatish uchun, ixtiyoriy) — sotuvda ishlatilmaydi */
  oldPrice?: number;
  /** Ulgurji narx (ixtiyoriy). Kassada "Ulgurji narxlar" yoqilganda shu narxda sotiladi */
  wholesalePrice?: number;
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
  /** Yo'nalishga xos maydonlar (lib/businessTypes.ts → PRODUCT_FIELDS) — hammasi ixtiyoriy */
  category?: string;
  /** Turkum (ProductCategory) — `category` shu turkum nomi */
  categoryId?: Types.ObjectId;
  /** Variativ tovar: bitta guruhdagi turlar (rang/o'lcham) umumiy guruh kaliti va tur nomi */
  variantGroupId?: string;
  variantName?: string;
  unit?: ProductUnit;
  size?: string;
  warrantyMonths?: number;
  batchNumber?: string;
  expiryDate?: Date;
  oemCode?: string;
  createdBy?: string;
  /** Yetkazib beruvchi (ixtiyoriy) */
  supplierId?: Types.ObjectId;
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
      enum: ['created', 'sold', 'transferred', 'returned', 'edited', 'restocked', 'revalued', 'writtenOff'],
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
    oldPrice: { type: Number, min: 0 },
    wholesalePrice: { type: Number, min: 0 },
    kind: { type: String, enum: PRODUCT_KINDS, default: 'goods' },
    bundleItems: {
      type: [{
        _id: false,
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        qty: { type: Number, required: true, min: 0.001 },
      }],
      default: undefined,
    },
    trackQuantity: { type: Boolean, default: false },
    // Kasrli birlikda (kg, m…) 0.001 gacha; butun birlikda butunlik ilova darajasida (lib/qty.ts)
    quantity: { type: Number, default: 1, min: 0.001 },
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
    category: { type: String, trim: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'ProductCategory' },
    variantGroupId: { type: String, trim: true },
    variantName: { type: String, trim: true },
    unit: { type: String, enum: PRODUCT_UNITS },
    size: { type: String, trim: true },
    warrantyMonths: { type: Number, min: 0, max: 120 },
    batchNumber: { type: String, trim: true, uppercase: true },
    expiryDate: { type: Date },
    oemCode: { type: String, trim: true, uppercase: true },
    createdBy: { type: String, trim: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    soldAt: { type: Date },
    history: { type: [productHistorySchema], default: [] },
  },
  { timestamps: true, collection: 'products' }
);

// O'chirish — soft-delete (deletedAt); o'chirilganlar so'rovlardan avtomatik yashiriladi
productSchema.plugin(softDeletePlugin);

productSchema.index({ branchId: 1, status: 1 });
productSchema.index({ barcode: 1 }, { sparse: true });
productSchema.index({ category: 1 }, { sparse: true });
productSchema.index({ categoryId: 1 }, { sparse: true });
productSchema.index({ variantGroupId: 1 }, { sparse: true });
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
  revalued: 'Narx qayta baholandi',
  writtenOff: 'Hisobdan chiqarildi',
};

export type ProductDoc = IProduct & { _id: Types.ObjectId };
