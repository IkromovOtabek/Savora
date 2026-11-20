import { Schema, Types } from 'mongoose';
import { PAY_METHODS, type PayMethod } from '../../payMethods';
import {
  ITEM_STATUSES,
  ORDER_SOURCES,
  ORDER_STATUSES,
  ORDER_TYPES,
  STATION_KINDS,
  VOID_STAGES,
  type ItemStatus,
  type OrderModifier,
  type OrderSource,
  type OrderStatus,
  type OrderType,
  type StationKind,
  type VoidStage,
} from '../../restaurant/types';

/**
 * Restoran buyurtmasi (stol hisobi). Holatlar va amallar: lib/restaurant/rules.ts, lib/restaurant/ops.ts;
 * to'lovda har taom mavjud `Sale` qatoriga aylanadi (Sale.orderId, Sale.tableNumber) — kassa, smena,
 * hisobotlar o'zgarmasdan ishlaydi. Hujjat: docs/RESTORAN_API.md.
 *
 * Parallel o'zgarishlar: har yozuv `rev` bo'yicha optimistik qulf bilan (ops.ts → mutateOrder).
 */
export interface IOrderItem {
  _id: Types.ObjectId;
  /** Mobil/oflayn idempotentlik: qurilma bergan kalit (buyurtma ichida noyob) */
  clientItemId?: string;
  productId: Types.ObjectId;
  /** Qo'shilgan paytdagi nom */
  name: string;
  /** Mahsulotning asosiy narxi (qo'shilgan paytda) */
  basePrice: number;
  /** Birlik narxi = basePrice + modifikatorlar */
  price: number;
  qty: number;
  unit?: string;
  modifiers: OrderModifier[];
  note?: string;
  stationId?: Types.ObjectId;
  stationKind?: StationKind;
  status: ItemStatus;
  /** Ombor band qilinganmi (yuborilganda true; bekor qilinib qaytarilsa false) */
  stockReserved: boolean;
  addedBy: string;
  addedAt: Date;
  /** Mijoz QR orqali qo'shgan */
  fromQr?: boolean;
  confirmedBy?: string;
  sentAt?: Date;
  sentBy?: string;
  cookStartedAt?: Date;
  readyAt?: Date;
  servedAt?: Date;
  servedBy?: string;
  voidedAt?: Date;
  voidedBy?: string;
  voidReason?: string;
  voidStage?: VoidStage;
  /** To'langan qism (Order.payments[].checkoutId) — to'langan taom o'zgarmaydi */
  paidCheckoutId?: string;
  saleId?: Types.ObjectId;
}

export interface IOrderPayment {
  /** Klient bergan idempotentlik kaliti (ixtiyoriy) */
  payId?: string;
  checkoutId: string;
  itemIds: Types.ObjectId[];
  saleIds: Types.ObjectId[];
  subtotal: number;
  discount: number;
  serviceCharge: number;
  packFee: number;
  total: number;
  parts: { method: PayMethod; amount: number }[];
  change: number;
  paidAt: Date;
  by: string;
}

export interface IOrder {
  orderNo: string;
  branchId: Types.ObjectId;
  type: OrderType;
  source: OrderSource;
  status: OrderStatus;
  tableId?: Types.ObjectId;
  /** Stol raqami (nusxa — stol o'chirilsa ham chekda qoladi) */
  tableNumber?: number;
  hallId?: Types.ObjectId;
  /**
   * Ochiq buyurtmada = String(tableId); yopilganda o'chiriladi. Noyob qisman indeks — bir stolda
   * bir vaqtda faqat bitta ochiq buyurtma (parallel «stol ochish»da ikkinchisi mavjudini oladi).
   */
  activeTableKey?: string;
  /**
   * Saboy (takeaway) qaysi stol mehmonlariga — faqat ma'lumot (ro'yxat, chek, oshxona varag'i). Stol bandligiga
   * (`activeTableKey`) ta'sir qilmaydi: stolda o'z ochiq buyurtmasi bo'lishi mumkin, bitta stolga bir nechta saboy ham.
   */
  forTableId?: Types.ObjectId;
  /** Stol raqami (nusxa — stol o'chirilsa ham chekda qoladi) */
  forTableNumber?: number;
  guests?: number;
  waiterId?: string;
  waiterName?: string;
  /** Ochilgan paytdagi xizmat haqi foizi (saboy va QR o'zi buyurtmada 0) */
  serviceChargePct: number;
  /** Saboy qadoq haqi (ochilgan paytdagi sozlama) */
  packFee: number;
  /** Qadoq haqi qaysi to'lov qismida olingan */
  packFeePaid?: boolean;
  items: IOrderItem[];
  payments: IOrderPayment[];
  note?: string;
  /** Mijoz QR orqali yaratgan bo'lsa — mijoz qurilmasi kaliti (takroriy yuborishdan himoya) */
  clientOrderId?: string;
  openedBy: string;
  openedAt: Date;
  precheckAt?: Date;
  precheckBy?: string;
  paidAt?: Date;
  cancelledAt?: Date;
  cancelledBy?: string;
  cancelReason?: string;
  /** Optimistik qulf: har o'zgarishda +1 */
  rev: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const modifierSchema = new Schema<OrderModifier>(
  {
    group: { type: String, required: true, trim: true, maxlength: 60 },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const orderItemSchema = new Schema<IOrderItem>({
  clientItemId: { type: String, trim: true, maxlength: 64 },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  basePrice: { type: Number, required: true, min: 0 },
  price: { type: Number, required: true, min: 0 },
  qty: { type: Number, required: true, min: 0.001 },
  unit: { type: String, trim: true },
  modifiers: { type: [modifierSchema], default: [] },
  note: { type: String, trim: true, maxlength: 200 },
  stationId: { type: Schema.Types.ObjectId, ref: 'KitchenStation' },
  stationKind: { type: String, enum: STATION_KINDS },
  status: { type: String, enum: ITEM_STATUSES, required: true, default: 'new' },
  stockReserved: { type: Boolean, default: false },
  addedBy: { type: String, required: true, trim: true },
  addedAt: { type: Date, required: true, default: Date.now },
  fromQr: { type: Boolean },
  confirmedBy: { type: String, trim: true },
  sentAt: { type: Date },
  sentBy: { type: String, trim: true },
  cookStartedAt: { type: Date },
  readyAt: { type: Date },
  servedAt: { type: Date },
  servedBy: { type: String, trim: true },
  voidedAt: { type: Date },
  voidedBy: { type: String, trim: true },
  voidReason: { type: String, trim: true, maxlength: 200 },
  voidStage: { type: String, enum: VOID_STAGES },
  paidCheckoutId: { type: String, trim: true },
  saleId: { type: Schema.Types.ObjectId, ref: 'Sale' },
});

const orderPaymentSchema = new Schema<IOrderPayment>(
  {
    payId: { type: String, trim: true, maxlength: 64 },
    checkoutId: { type: String, required: true, trim: true },
    itemIds: { type: [Schema.Types.ObjectId], default: [] },
    saleIds: { type: [Schema.Types.ObjectId], default: [] },
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    serviceCharge: { type: Number, default: 0, min: 0 },
    packFee: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    parts: {
      type: [{ _id: false, method: { type: String, enum: PAY_METHODS, required: true }, amount: { type: Number, required: true, min: 0 } }],
      default: [],
    },
    change: { type: Number, default: 0, min: 0 },
    paidAt: { type: Date, required: true, default: Date.now },
    by: { type: String, required: true, trim: true },
  },
  { _id: false }
);

export const orderSchema = new Schema<IOrder>(
  {
    orderNo: { type: String, required: true, unique: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    type: { type: String, enum: ORDER_TYPES, required: true },
    source: { type: String, enum: ORDER_SOURCES, default: 'waiter' },
    status: { type: String, enum: ORDER_STATUSES, default: 'open' },
    tableId: { type: Schema.Types.ObjectId, ref: 'Table' },
    tableNumber: { type: Number },
    hallId: { type: Schema.Types.ObjectId, ref: 'Hall' },
    activeTableKey: { type: String },
    forTableId: { type: Schema.Types.ObjectId, ref: 'Table' },
    forTableNumber: { type: Number },
    guests: { type: Number, min: 1, max: 100 },
    waiterId: { type: String, trim: true },
    waiterName: { type: String, trim: true },
    serviceChargePct: { type: Number, default: 0, min: 0, max: 30 },
    packFee: { type: Number, default: 0, min: 0 },
    packFeePaid: { type: Boolean },
    items: { type: [orderItemSchema], default: [] },
    payments: { type: [orderPaymentSchema], default: [] },
    note: { type: String, trim: true, maxlength: 200 },
    clientOrderId: { type: String, trim: true, maxlength: 64 },
    openedBy: { type: String, required: true, trim: true },
    openedAt: { type: Date, required: true, default: Date.now },
    precheckAt: { type: Date },
    precheckBy: { type: String, trim: true },
    paidAt: { type: Date },
    cancelledAt: { type: Date },
    cancelledBy: { type: String, trim: true },
    cancelReason: { type: String, trim: true, maxlength: 200 },
    rev: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'orders' }
);

// Stollar/buyurtmalar ro'yxati va `?since=` polling
orderSchema.index({ branchId: 1, status: 1, updatedAt: -1 });
// Bir stolda bitta ochiq buyurtma
orderSchema.index({ activeTableKey: 1 }, { unique: true, partialFilterExpression: { activeTableKey: { $type: 'string' } } });
// Oshxona ekrani (KDS): filial + stansiya + taom holati
orderSchema.index({ branchId: 1, 'items.stationId': 1, 'items.status': 1 });
orderSchema.index({ tableId: 1, createdAt: -1 });
// Mijoz QR buyurtmasi takroriy yuborilmasin
orderSchema.index({ clientOrderId: 1 }, { unique: true, partialFilterExpression: { clientOrderId: { $type: 'string' } } });
// Hisobot: davr bo'yicha yopilgan buyurtmalar
orderSchema.index({ branchId: 1, paidAt: -1 }, { partialFilterExpression: { paidAt: { $type: 'date' } } });

export type OrderDoc = IOrder & { _id: Types.ObjectId };
export type OrderItemDoc = IOrderItem;
