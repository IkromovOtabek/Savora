import { Schema, Types } from 'mongoose';

/**
 * E-commerce ochiq katalogi (master baza) — barcha do'konlarning chiqarilgan tovarlari bitta joyda (tez qidiruv).
 * Bu KESH: haqiqiy manba — do'kon bazasidagi Product. lib/ecom/sync.ts qayta yig'adi; buyurtmada narx va
 * qoldiq do'kon bazasidan jonli tekshiriladi (lib/ecom/orders.ts).
 *
 * Bitta yozuv = do'kondagi bir xil tovarlar guruhi (nom + tur + rang — lib/ecom/group.ts → ecomGroupKey):
 * telefon do'konidagi 20 ta bir xil iPhone yoki turli filiallardagi nusxalar bitta kartochka bo'ladi.
 * IMEI, kelish narxi, yetkazib beruvchi va boshqa ichki ma'lumot bu yerga HECH QACHON yozilmaydi.
 */
export interface IMarketListing {
  orgId: Types.ObjectId;
  /** Do'kon bazasi (sinxronlash va buyurtma uchun ichki; API javobiga chiqmaydi) */
  dbName: string;
  shopSlug: string;
  shopName: string;
  /** Guruh kaliti (do'kon ichida noyob) */
  key: string;
  /** Guruhdagi do'kon mahsulotlari (_id) — buyurtma shu hujjatlardan bajariladi */
  productIds: Types.ObjectId[];
  name: string;
  description?: string;
  images: string[];
  /** Eng past sotish narxi (so'm) */
  price: number;
  /** Guruhda narxlar har xil bo'lsa — «…dan» ko'rsatiladi */
  priceFrom: boolean;
  oldPrice?: number;
  unit?: string;
  category?: string;
  brand?: string;
  /** Xaridor uchun mavjud miqdor (barcha filiallar yig'indisi) */
  qty: number;
  /** Kasrli birlik (kg, m…) — savatda 0.1 qadam */
  fractional: boolean;
  syncedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export const marketListingSchema = new Schema<IMarketListing>(
  {
    orgId: { type: Schema.Types.ObjectId, required: true },
    dbName: { type: String, required: true },
    shopSlug: { type: String, required: true },
    shopName: { type: String, required: true, trim: true },
    key: { type: String, required: true },
    productIds: { type: [Schema.Types.ObjectId], default: [] },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    images: { type: [String], default: [] },
    price: { type: Number, required: true, min: 0 },
    priceFrom: { type: Boolean, default: false },
    oldPrice: { type: Number, min: 0 },
    unit: { type: String },
    category: { type: String, trim: true },
    brand: { type: String, trim: true },
    qty: { type: Number, default: 0, min: 0 },
    fractional: { type: Boolean, default: false },
    syncedAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'market_listings' },
);

marketListingSchema.index({ orgId: 1, key: 1 }, { unique: true });
marketListingSchema.index({ orgId: 1, syncedAt: 1 });
// «Yangilari» — katalogga birinchi chiqqan vaqt (createdAt; updatedAt har sinxronda yangilanadi)
marketListingSchema.index({ shopSlug: 1, createdAt: -1 });
marketListingSchema.index({ createdAt: -1 });
marketListingSchema.index({ price: 1 });
marketListingSchema.index({ category: 1 }, { sparse: true });
