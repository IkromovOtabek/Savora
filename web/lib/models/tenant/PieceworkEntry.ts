import { Schema, Types } from 'mongoose';

/**
 * Ishbay yozuvi — docs/SEX_API.md. Ishchi (User) bajargan ishni yozadi → boshliq tasdiqlaydi (yoki rad etadi) →
 * to'lanadi (CashFlow chiqimi «Ish haqi», `cashFlowId`). Holatlar: logged → approved → paid; logged → rejected.
 * Mobil/oflayn takrorlanishdan himoya — `clientId` (ishchi ichida noyob).
 */
export const PIECEWORK_STATUSES = ['logged', 'approved', 'rejected', 'paid'] as const;
export type PieceworkStatus = (typeof PIECEWORK_STATUSES)[number];

export interface IPieceworkEntry {
  workerId: Types.ObjectId;
  /** Ko'rsatish uchun (yozilgandagi login/ism) */
  workerName: string;
  /** Ishchi filiali (filial boshlig'i faqat o'z filialini ko'radi) */
  branchId?: Types.ObjectId;
  productionOrderId?: Types.ObjectId;
  productionOrderNo?: string;
  operation: string;
  qty: number;
  /** 1 birlik narxi (so'm): aktdagi texkarta operatsiyasidan yoki qo'lda */
  rate: number;
  /** qty × rate (butun so'm) */
  amount: number;
  status: PieceworkStatus;
  /** Ish bajarilgan kun */
  workDate: Date;
  note?: string;
  clientId?: string;
  loggedBy: string;
  approvedBy?: string;
  approvedAt?: Date;
  rejectedBy?: string;
  rejectedAt?: Date;
  rejectReason?: string;
  paidBy?: string;
  paidAt?: Date;
  /** To'lov — kassa chiqimi (CashFlow) va bitta to'lovdagi yozuvlar guruhi */
  cashFlowId?: Types.ObjectId;
  payoutId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const pieceworkEntrySchema = new Schema<IPieceworkEntry>(
  {
    workerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    workerName: { type: String, required: true, trim: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    productionOrderId: { type: Schema.Types.ObjectId, ref: 'ProductionOrder' },
    productionOrderNo: { type: String, trim: true },
    operation: { type: String, required: true, trim: true, maxlength: 80 },
    qty: { type: Number, required: true, min: 0.001 },
    rate: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: PIECEWORK_STATUSES, default: 'logged' },
    workDate: { type: Date, required: true },
    note: { type: String, trim: true, maxlength: 300 },
    clientId: { type: String, trim: true },
    loggedBy: { type: String, required: true, trim: true },
    approvedBy: { type: String, trim: true },
    approvedAt: { type: Date },
    rejectedBy: { type: String, trim: true },
    rejectedAt: { type: Date },
    rejectReason: { type: String, trim: true, maxlength: 300 },
    paidBy: { type: String, trim: true },
    paidAt: { type: Date },
    cashFlowId: { type: Schema.Types.ObjectId, ref: 'CashFlow' },
    payoutId: { type: String, trim: true },
  },
  { timestamps: true, collection: 'piecework_entries' },
);

pieceworkEntrySchema.index({ workerId: 1, workDate: -1 });
pieceworkEntrySchema.index({ status: 1, workDate: -1 });
pieceworkEntrySchema.index({ branchId: 1, workDate: -1 });
pieceworkEntrySchema.index({ productionOrderId: 1 }, { sparse: true });
pieceworkEntrySchema.index({ payoutId: 1 }, { sparse: true });
pieceworkEntrySchema.index(
  { workerId: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } },
);

export type PieceworkEntryDoc = IPieceworkEntry & { _id: Types.ObjectId };
