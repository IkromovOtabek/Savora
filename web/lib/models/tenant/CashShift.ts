import { Schema, Types } from 'mongoose';

export type CashShiftStatus = 'open' | 'closed';

/**
 * Kassa smenasi — filial kassasining ochilishidan yopilishigacha bo'lgan davr.
 * Bitta filialda bir vaqtda faqat bitta ochiq smena (qisman unikal indeks).
 */
export interface ICashShift {
  /** Smena raqami: K-00001 */
  shiftNo: string;
  branchId: Types.ObjectId;
  status: CashShiftStatus;
  openedAt: Date;
  openedBy: string;
  /** Ochilishda kassadagi naqd pul */
  openingCash: number;
  closedAt?: Date;
  closedBy?: string;
  /** Yopilishda hisoblangan (kutilgan) naqd: ochilish + tushum − qaytarish − olingan */
  expectedCash?: number;
  /** Yopilishda kassir sanab kiritgan naqd */
  countedCash?: number;
  /** countedCash − expectedCash (manfiy — kamomad) */
  difference?: number;
  note?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const cashShiftSchema = new Schema<ICashShift>(
  {
    shiftNo: { type: String, required: true, trim: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    status: { type: String, enum: ['open', 'closed'], required: true, default: 'open' },
    openedAt: { type: Date, required: true, default: Date.now },
    openedBy: { type: String, required: true, trim: true },
    openingCash: { type: Number, required: true, min: 0 },
    closedAt: { type: Date },
    closedBy: { type: String, trim: true },
    expectedCash: { type: Number },
    countedCash: { type: Number, min: 0 },
    difference: { type: Number },
    note: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true, collection: 'cash_shifts' }
);

// Bitta filialda faqat bitta ochiq smena — parallel so'rovlarda ham baza darajasida kafolat
cashShiftSchema.index({ branchId: 1 }, { unique: true, partialFilterExpression: { status: 'open' }, name: 'one_open_shift_per_branch' });
cashShiftSchema.index({ shiftNo: 1 }, { unique: true });
cashShiftSchema.index({ branchId: 1, openedAt: -1 });
cashShiftSchema.index({ status: 1, openedAt: -1 });

export type CashShiftDoc = ICashShift & { _id: Types.ObjectId };
