import { Schema, Types } from 'mongoose';
import { softDeletePlugin } from '../../softDelete';
import { PRODUCT_UNITS, type ProductUnit } from '../../businessTypes';
import { markEcomDirty } from '../../ecom/dirty';

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
  | 'writtenOff'
  /** Ishlab chiqarish: xom ashyo sarflandi / tayyor mahsulot kirim bo'ldi (lib/production) */
  | 'consumed'
  | 'produced';

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

export interface IExtraField {
  name: string;
  value: string;
}

/** Restoran: modifikator guruhi («Porsiya»: Kichik/Katta, «Qo'shimcha»: Pishloq +5000) — lib/restaurant/modifiers.ts */
export interface IModifierOption {
  _id?: Types.ObjectId;
  name: string;
  /** Qo'shimcha narx (so'm) */
  price: number;
}
export interface IModifierGroup {
  _id?: Types.ObjectId;
  name: string;
  required: boolean;
  min: number;
  max: number;
  options: IModifierOption[];
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
  /** Telefon do'koni: IMEI hali kiritilmagan (Excel importi) — `imei`da vaqtinchalik SKU turadi */
  imeiPending?: boolean;
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
  /** Qo'shimcha ustunlar (Excel importidan yoki qo'lda): «Mamlakat: UZ» — lib/productImport.ts chegaralari */
  extraFields?: IExtraField[];
  createdBy?: string;
  /** Yetkazib beruvchi (ixtiyoriy) */
  supplierId?: Types.ObjectId;
  /** Sotilgan sana */
  soldAt?: Date;
  /** Bajarilgan amallar tarixi */
  history?: IProductHistory[];
  /** MXIK (IKPU) — soliq tasniflagichi kodi, fiskal chek uchun (ixtiyoriy; yangi kiritish 17 raqam — lib/mxik.ts) */
  ikpu?: string;
  /** Markirovkali tovar (GS1 DataMatrix «Asl belgisi») — kassada har donaga kod skanerlash so'raladi (lib/marking.ts) */
  marked?: boolean;
  /** Restoran: qaysi stansiyaga (oshxona/bar) yo'naladi; yo'q — stansiyasiz (yuborilganda darhol «yetkazildi») */
  stationId?: Types.ObjectId;
  /** Restoran: modifikator guruhlari */
  modifierGroups?: IModifierGroup[];
  /** Restoran: stop-list — tugagan, menyuda va QR-menyuda ko'rinmaydi, oshxonaga yuborilmaydi (mahsulot filialga tegishli) */
  stopListed?: boolean;
  /**
   * Restoran: menyuda (taom, menyuga qo'shilgan tayyor tovar) yoki yo'q (xom ashyo). Yo'q bo'lsa — turi bo'yicha:
   * texkarta/xizmat — menyuda, oddiy tovar — yo'q (lib/restaurant/menuFlags.ts → isOnMenu, bir martalik migratsiya).
   */
  menuItem?: boolean;
  /** Tizim mahsuloti (masalan restoran xizmat haqi qatori) — soft-delete holatida, ro'yxatlarda ko'rinmaydi */
  systemKey?: string;
  /**
   * Filialdan MUSTAQIL barqaror kod (texkarta, kirim, ishlab chiqarish shu kod bilan bog'lanadi — docs/SEX_API.md).
   * `productId` va `imei` butun do'kon bo'yicha noyob (har filialdagi nusxa — alohida hujjat), shuning uchun alohida
   * maydon: bir xil tovarning turli filiallardagi hujjatlari bir xil `itemCode` ga ega. Yo'q bo'lsa — `productId`
   * (lib/production/itemCode.ts → codeOf); birinchi marta texkarta/kirimda o'rnatiladi.
   */
  itemCode?: string;
  /** Xarid birligi (masalan «qop») va 1 xarid birligi = `purchaseFactor` asosiy birlik (1 qop = 50 kg) */
  purchaseUnit?: ProductUnit;
  purchaseFactor?: number;
  /** Minimal qoldiq (asosiy birlikda) — undan kam bo'lsa ogohlantirish (lib/production/lowStock.ts) */
  minStock?: number;
  /**
   * E-commerce (lib/ecom): yo'q — do'kon sozlamasiga ergashadi («avtomatik chiqarish»); true/false — egasi qo'lda
   * tanlagan. Baribir faqat sotish narxi > 0 va qoldig'i bor tovar chiqadi (lib/ecom/group.ts → isEcomCandidate).
   */
  ecomListed?: boolean;
  /** E-commerce tavsifi (xaridorga ko'rinadi) */
  ecomDescription?: string;
  /** E-commerce rasmlari (o'z storage'imiz URL'lari, ≤ ECOM_MAX_IMAGES); bo'sh bo'lsa — photoUrl */
  ecomImages?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

const productHistorySchema = new Schema<IProductHistory>(
  {
    action: {
      type: String,
      enum: ['created', 'sold', 'transferred', 'returned', 'edited', 'restocked', 'revalued', 'writtenOff', 'consumed', 'produced'],
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
    imeiPending: { type: Boolean },
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
    extraFields: {
      type: [{
        _id: false,
        name: { type: String, required: true, trim: true, maxlength: 40 },
        value: { type: String, required: true, trim: true, maxlength: 200 },
      }],
      default: undefined,
    },
    createdBy: { type: String, trim: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    soldAt: { type: Date },
    history: { type: [productHistorySchema], default: [] },
    ikpu: { type: String, trim: true, maxlength: 30 },
    marked: { type: Boolean },
    stationId: { type: Schema.Types.ObjectId, ref: 'KitchenStation' },
    modifierGroups: {
      type: [{
        name: { type: String, required: true, trim: true, maxlength: 60 },
        required: { type: Boolean, default: false },
        min: { type: Number, default: 0, min: 0, max: 20 },
        max: { type: Number, default: 1, min: 1, max: 20 },
        options: {
          type: [{
            name: { type: String, required: true, trim: true, maxlength: 60 },
            price: { type: Number, default: 0, min: 0 },
          }],
          default: [],
        },
      }],
      default: undefined,
    },
    stopListed: { type: Boolean },
    menuItem: { type: Boolean },
    systemKey: { type: String, trim: true },
    itemCode: { type: String, trim: true, uppercase: true, maxlength: 40 },
    purchaseUnit: { type: String, enum: PRODUCT_UNITS },
    purchaseFactor: { type: Number, min: 0.001, max: 1_000_000 },
    minStock: { type: Number, min: 0 },
    ecomListed: { type: Boolean },
    ecomDescription: { type: String, trim: true, maxlength: 2000 },
    ecomImages: { type: [{ type: String, trim: true, maxlength: 500 }], default: undefined },
  },
  { timestamps: true, collection: 'products' }
);

// E-commerce katalogi (master MarketListing) — har qanday mahsulot yozuvidan keyin do'kon katalogi qayta yig'iladi
// (debounce bilan). Sotuv, ko'chirish, import, mobil — hammasi shu ilgak orqali qamraladi (lib/ecom/dirty.ts).
productSchema.post('save', function () { markEcomDirty(this.db?.name); });
productSchema.post(['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'], function () {
  markEcomDirty(this.model?.db?.name);
});
productSchema.post('insertMany', function () { markEcomDirty(this.db?.name); });
productSchema.post('bulkWrite', function () { markEcomDirty(this.db?.name); });

// O'chirish — soft-delete (deletedAt); o'chirilganlar so'rovlardan avtomatik yashiriladi
productSchema.plugin(softDeletePlugin);

productSchema.index({ branchId: 1, status: 1 });
productSchema.index({ barcode: 1 }, { sparse: true });
// «IMEI kiriting» bildirishnomasi — IMEI'siz tovarlar soni (faqat belgilanganlari indeksda)
productSchema.index({ imeiPending: 1 }, { sparse: true });
productSchema.index({ category: 1 }, { sparse: true });
productSchema.index({ categoryId: 1 }, { sparse: true });
productSchema.index({ variantGroupId: 1 }, { sparse: true });
// Ombor ro'yxatidagi qo'shimcha ustunlar nomlari (distinct) — indeks bo'yicha
productSchema.index({ 'extraFields.name': 1 }, { sparse: true });
productSchema.index({ name: 'text', brand: 'text', deviceModel: 'text', imei: 'text' });
// Restoran: oshxona stansiyasiga bog'langan taomlar (stansiya o'chirilganda tozalash)
productSchema.index({ stationId: 1 }, { sparse: true });
// Ishlab chiqarish/kirim: barqaror kod bo'yicha filialdagi nusxani topish; minimal qoldiq ro'yxati
productSchema.index({ itemCode: 1, branchId: 1 }, { sparse: true });
productSchema.index({ minStock: 1 }, { sparse: true });

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
  consumed: 'Ishlab chiqarishga sarflandi',
  produced: 'Ishlab chiqarildi',
};

export type ProductDoc = IProduct & { _id: Types.ObjectId };
