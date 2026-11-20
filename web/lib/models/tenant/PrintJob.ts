import { Schema, Types } from 'mongoose';
import { ORDER_TYPES, PRINT_JOB_KINDS, PRINT_JOB_STATUSES, type OrderType, type PrintJobKind, type PrintJobStatus } from '../../restaurant/types';

/**
 * Oshxona/bar varag'i navbati (stansiya printeri). Taom oshxonaga yuborilganda — `order` varag'i,
 * yuborilgan taom bekor qilinganda — `void` («BEKOR QILINDI») varag'i; faqat `printEnabled` stansiyalar uchun.
 * Printer stansiyasi (brauzer sahifasi /app/kitchen/print) varaqni atomik «oladi» (claim), chop etadi va
 * `printed` deb belgilaydi. Mantiq: lib/restaurant/print.ts (navbatga qo'yish), printQueue.ts (olish/belgilash).
 * Hujjat: docs/RESTORAN_API.md → «Oshxona printeri».
 */
export interface IPrintJobLine {
  itemId: Types.ObjectId;
  name: string;
  qty: number;
  unit?: string;
  modifiers: { group: string; name: string }[];
  note?: string;
  fromQr?: boolean;
  /** Bekor qilish sababi (`void` varag'ida) */
  reason?: string;
}

export interface IPrintJob {
  branchId: Types.ObjectId;
  stationId: Types.ObjectId;
  /** Stansiya nomi (nusxa — varaqda chiqadi) */
  stationName: string;
  kind: PrintJobKind;
  orderId: Types.ObjectId;
  orderNo: string;
  orderType: OrderType;
  tableNumber?: number;
  /** Saboy qaysi stol mehmonlariga — varaqda «SABOY · STOL 5» */
  forTableNumber?: number;
  waiterName?: string;
  guests?: number;
  orderNote?: string;
  lines: IPrintJobLine[];
  status: PrintJobStatus;
  /** Navbatga qo'yilgan payt (qayta chop etishda yangilanadi) — eski varaqlar avtomatik chop etilmaydi */
  queuedAt: Date;
  /** Qayta chop etish — varaqda «NUSXA» */
  copy?: boolean;
  /** Qaysi qurilma olgan (printer stansiyasi kaliti) va qachon — muddat o'tsa boshqasi oladi */
  claimedBy?: string;
  claimedAt?: Date;
  attempts: number;
  printedAt?: Date;
  /** Chop etgan login (printer stansiyasidagi sessiya) */
  printedBy?: string;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const lineSchema = new Schema<IPrintJobLine>(
  {
    itemId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    qty: { type: Number, required: true, min: 0 },
    unit: { type: String, trim: true },
    modifiers: {
      type: [{ _id: false, group: { type: String, trim: true, maxlength: 60 }, name: { type: String, trim: true, maxlength: 60 } }],
      default: [],
    },
    note: { type: String, trim: true, maxlength: 200 },
    fromQr: { type: Boolean },
    reason: { type: String, trim: true, maxlength: 200 },
  },
  { _id: false }
);

export const printJobSchema = new Schema<IPrintJob>(
  {
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    stationId: { type: Schema.Types.ObjectId, ref: 'KitchenStation', required: true },
    stationName: { type: String, required: true, trim: true, maxlength: 60 },
    kind: { type: String, enum: PRINT_JOB_KINDS, required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    orderNo: { type: String, required: true, trim: true },
    orderType: { type: String, enum: ORDER_TYPES, required: true },
    tableNumber: { type: Number },
    forTableNumber: { type: Number },
    waiterName: { type: String, trim: true },
    guests: { type: Number },
    orderNote: { type: String, trim: true, maxlength: 200 },
    lines: { type: [lineSchema], default: [] },
    status: { type: String, enum: PRINT_JOB_STATUSES, default: 'pending' },
    queuedAt: { type: Date, required: true, default: Date.now },
    copy: { type: Boolean },
    claimedBy: { type: String, trim: true, maxlength: 64 },
    claimedAt: { type: Date },
    attempts: { type: Number, default: 0 },
    printedAt: { type: Date },
    printedBy: { type: String, trim: true },
    createdBy: { type: String, required: true, trim: true },
  },
  { timestamps: true, collection: 'print_jobs' }
);

// Printer stansiyasi: filial bo'yicha kutilayotgan varaqlar (stansiya — qo'shimcha filtr)
printJobSchema.index({ branchId: 1, status: 1, queuedAt: 1 });
// Oxirgi varaqlar ro'yxati
printJobSchema.index({ branchId: 1, createdAt: -1 });
// Navbat vaqtinchalik: 7 kundan keyin o'chadi (hisobot buyurtmalardan olinadi)
printJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export type PrintJobDoc = IPrintJob & { _id: Types.ObjectId };
