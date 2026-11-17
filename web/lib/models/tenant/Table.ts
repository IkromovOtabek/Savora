import { Schema, Types } from 'mongoose';

/**
 * Restoran stoli. `number` — filial ichida noyob (Sale.tableNumber, chek va KDS'da ko'rinadi).
 * `qrToken` — mijoz QR-menyusi havolasi uchun tasodifiy noyob kalit (lib/restaurant/qr.ts); almashtirilsa eski QR ishlamaydi.
 * Band/bo'shligi bu yerda saqlanmaydi — ochiq buyurtmadan (Order.activeTableKey) hisoblanadi.
 */
export interface ITable {
  hallId: Types.ObjectId;
  branchId: Types.ObjectId;
  number: number;
  seats: number;
  /** Zal xaritasidagi joy (ixtiyoriy; oddiy grid uchun shart emas) */
  x?: number;
  y?: number;
  qrToken: string;
  active: boolean;
  /** Mijoz QR orqali «Ofitsantni chaqirish» bosgan vaqt (ofitsant ko'rgach tozalanadi) */
  callWaiterAt?: Date;
  /** Mijoz QR orqali «Hisob so'rash» bosgan vaqt */
  callBillAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export const tableSchema = new Schema<ITable>(
  {
    hallId: { type: Schema.Types.ObjectId, ref: 'Hall', required: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    number: { type: Number, required: true, min: 1, max: 9999 },
    seats: { type: Number, default: 4, min: 1, max: 100 },
    x: { type: Number, min: 0, max: 10000 },
    y: { type: Number, min: 0, max: 10000 },
    qrToken: { type: String, required: true, trim: true, maxlength: 64 },
    active: { type: Boolean, default: true },
    callWaiterAt: { type: Date },
    callBillAt: { type: Date },
  },
  { timestamps: true, collection: 'tables' }
);

tableSchema.index({ branchId: 1, number: 1 }, { unique: true });
tableSchema.index({ qrToken: 1 }, { unique: true });
tableSchema.index({ hallId: 1 });

export type TableDoc = ITable & { _id: Types.ObjectId };
