import { Schema, Types } from 'mongoose';
import { RESERVATION_STATUSES, type ReservationStatus } from '../../restaurant/reservationRules';

/**
 * Restoran broni (oldindan stol band qilish) — docs/RESTORAN_API.md §18, mantiq: lib/restaurant/reservations.ts.
 * Vaqt — `startAt` (lahza, UTC), ko'rsatish va kun chegaralari Toshkent vaqtida (UTC+5). `endAt` = startAt + durationMin —
 * ustma-ust tekshiruvi uchun saqlanadi (bir stolda kesishgan `booked|seated` bron bo'lmaydi).
 * Oldindan taomlar — faqat tanlov (narx saqlanmaydi): «Keldi» bosilganda buyurtmaga hozirgi narxda qo'shiladi.
 */
export interface IReservationItem {
  productId: Types.ObjectId;
  /** Ko'rsatish uchun (bron yaratilgandagi nom) */
  name: string;
  qty: number;
  note?: string;
  /** Tanlangan modifikator variantlari (Product.modifierGroups[].options[]._id) */
  optionIds?: Types.ObjectId[];
  /** Ko'rsatish uchun variant nomlari («Katta») */
  options?: string[];
}

export interface IReservation {
  branchId: Types.ObjectId;
  tableId: Types.ObjectId;
  tableNumber: number;
  hallId?: Types.ObjectId;
  customerId?: Types.ObjectId;
  customerName: string;
  customerPhone: string;
  guests: number;
  startAt: Date;
  durationMin: number;
  endAt: Date;
  items: IReservationItem[];
  note?: string;
  status: ReservationStatus;
  /** «Keldi» — ochilgan buyurtma */
  orderId?: Types.ObjectId;
  seatedAt?: Date;
  seatedBy?: string;
  cancelledAt?: Date;
  cancelledBy?: string;
  cancelReason?: string;
  noShowAt?: Date;
  noShowBy?: string;
  /** Eslatma (bildirishnoma) yuborilgan vaqt — takror yuborilmaydi */
  remindedAt?: Date;
  createdBy: string;
  updatedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const itemSchema = new Schema<IReservationItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    qty: { type: Number, required: true, min: 0.001, max: 1000 },
    note: { type: String, trim: true, maxlength: 200 },
    optionIds: { type: [Schema.Types.ObjectId], default: undefined },
    options: { type: [String], default: undefined },
  },
  { _id: false },
);

export const reservationSchema = new Schema<IReservation>(
  {
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    tableId: { type: Schema.Types.ObjectId, ref: 'Table', required: true },
    tableNumber: { type: Number, required: true, min: 1, max: 9999 },
    hallId: { type: Schema.Types.ObjectId, ref: 'Hall' },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    customerName: { type: String, required: true, trim: true, maxlength: 80 },
    customerPhone: { type: String, required: true, trim: true, maxlength: 40 },
    guests: { type: Number, required: true, min: 1, max: 100 },
    startAt: { type: Date, required: true },
    durationMin: { type: Number, required: true, min: 15, max: 1440, default: 120 },
    endAt: { type: Date, required: true },
    items: { type: [itemSchema], default: [] },
    note: { type: String, trim: true, maxlength: 300 },
    status: { type: String, enum: [...RESERVATION_STATUSES], default: 'booked', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    seatedAt: { type: Date },
    seatedBy: { type: String },
    cancelledAt: { type: Date },
    cancelledBy: { type: String },
    cancelReason: { type: String, trim: true, maxlength: 200 },
    noShowAt: { type: Date },
    noShowBy: { type: String },
    remindedAt: { type: Date },
    createdBy: { type: String, required: true },
    updatedBy: { type: String },
  },
  { timestamps: true, collection: 'reservations' },
);

// Kun ro'yxati (filial + vaqt), stol bo'yicha ustma-ust tekshiruvi, eslatma cron'i (holat + vaqt)
reservationSchema.index({ branchId: 1, startAt: 1 });
reservationSchema.index({ tableId: 1, startAt: 1 });
reservationSchema.index({ status: 1, startAt: 1 });

export type ReservationDoc = IReservation & { _id: Types.ObjectId };
