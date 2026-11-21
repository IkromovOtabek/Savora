import { Schema, Types } from 'mongoose';

/**
 * E-commerce buyurtmasi (master baza). Savatda bir nechta do'kon tovari bo'lsa — har do'konga alohida buyurtma.
 * To'lov onlayn emas: naqd/karta topshirishda. Oqim: new → accepted → completed (do'konda sotuv yoziladi)
 * yoki new/accepted → rejected (do'kon) / cancelled (xaridor, faqat new holatida).
 */
export const MARKET_ORDER_STATUSES = ['new', 'accepted', 'completed', 'rejected', 'cancelled'] as const;
export type MarketOrderStatus = (typeof MARKET_ORDER_STATUSES)[number];
export const MARKET_DELIVERY = ['pickup', 'delivery'] as const;
export type MarketDelivery = (typeof MARKET_DELIVERY)[number];

/** Yakunlash qulfi muddati: undan eski qulf — uzilgan jarayon, ochiq hisoblanadi (yakunlash odatda soniyalar) */
export const COMPLETE_LOCK_MS = 2 * 60_000;

/** Qulflanmagan (yoki qulfi eskirgan) buyurtma sharti — bekor/rad/qabul/yakunlash filtrlariga qo'shiladi */
export function unlocked(now = Date.now()): Record<string, unknown> {
  return { $or: [{ completingAt: null }, { completingAt: { $lt: new Date(now - COMPLETE_LOCK_MS) } }] };
}

export interface IMarketOrderItem {
  listingId: Types.ObjectId;
  key: string;
  name: string;
  image?: string;
  price: number;
  qty: number;
  unit?: string;
  total: number;
  /** Buyurtma paytidagi do'kon mahsulotlari (ichki — yakunlashda shulardan sotiladi; xaridorga chiqmaydi) */
  productIds?: Types.ObjectId[];
}

export interface IMarketOrderEvent {
  status: MarketOrderStatus;
  at: Date;
  by?: string;
  note?: string;
}

export interface IMarketOrder {
  /** Ko'rinadigan raqam: E-260001 */
  orderNo: string;
  buyerId: Types.ObjectId;
  buyerName: string;
  buyerPhone: string;
  orgId: Types.ObjectId;
  shopSlug: string;
  shopName: string;
  items: IMarketOrderItem[];
  total: number;
  delivery: MarketDelivery;
  address?: string;
  note?: string;
  status: MarketOrderStatus;
  history: IMarketOrderEvent[];
  /** Rad/bekor sababi */
  reason?: string;
  /** Yakunlanganda do'konda yozilgan sotuvlar raqamlari */
  saleNos?: string[];
  /**
   * Yakunlash qulfi (lib/ecom/orders.ts): yakunlash davomida bekor/rad/qayta yakunlash to'siladi.
   * Toza tugaganda olib tashlanadi; qolgan bo'lsa — jarayon o'rtada uzilgan (eskirgach qulf o'z-o'zidan ochiladi).
   */
  completingAt?: Date;
  /** Xaridor ilovasining buyurtma urinishi kaliti — sekin tarmoqda qayta yuborilsa ikkinchi buyurtma ochilmaydi */
  clientId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const marketOrderSchema = new Schema<IMarketOrder>(
  {
    orderNo: { type: String, required: true, unique: true },
    buyerId: { type: Schema.Types.ObjectId, required: true },
    buyerName: { type: String, required: true, trim: true },
    buyerPhone: { type: String, required: true, trim: true },
    orgId: { type: Schema.Types.ObjectId, required: true },
    shopSlug: { type: String, required: true },
    shopName: { type: String, required: true, trim: true },
    items: {
      type: [{
        _id: false,
        listingId: { type: Schema.Types.ObjectId, required: true },
        key: { type: String, required: true },
        name: { type: String, required: true, trim: true },
        image: { type: String },
        price: { type: Number, required: true, min: 0 },
        qty: { type: Number, required: true, min: 0.001 },
        unit: { type: String },
        total: { type: Number, required: true, min: 0 },
        productIds: { type: [Schema.Types.ObjectId], default: undefined },
      }],
      validate: [(v: unknown[]) => v.length > 0 && v.length <= 50, 'items'],
    },
    total: { type: Number, required: true, min: 0 },
    delivery: { type: String, enum: MARKET_DELIVERY, required: true },
    address: { type: String, trim: true, maxlength: 300 },
    note: { type: String, trim: true, maxlength: 500 },
    status: { type: String, enum: MARKET_ORDER_STATUSES, default: 'new' },
    history: {
      type: [{
        _id: false,
        status: { type: String, enum: MARKET_ORDER_STATUSES, required: true },
        at: { type: Date, default: Date.now },
        by: { type: String, trim: true },
        note: { type: String, trim: true, maxlength: 300 },
      }],
      default: [],
    },
    reason: { type: String, trim: true, maxlength: 300 },
    saleNos: { type: [String], default: undefined },
    completingAt: { type: Date },
    clientId: { type: String, trim: true, maxlength: 64 },
  },
  { timestamps: true, collection: 'market_orders' },
);

marketOrderSchema.index({ buyerId: 1, createdAt: -1 });
marketOrderSchema.index({ orgId: 1, status: 1, createdAt: -1 });
// Bitta urinish — har do'konga ko'pi bilan bitta buyurtma (eski yozuvlarda clientId yo'q — indeksga kirmaydi)
marketOrderSchema.index(
  { buyerId: 1, clientId: 1, orgId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } },
);
