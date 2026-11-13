import { Schema, Types } from 'mongoose';
import { softDeletePlugin } from '../../softDelete';

/** Daftar yozuvi — shaxsiy qarz oldi-berdi. */
export type LedgerType = 'given' | 'taken'; // given = qarz berdim; taken = qarz oldim
export type LedgerStatus = 'open' | 'returned';

/** Qaytarish (to'liq yoki qisman) — har biri alohida yozuv */
export interface ILedgerPayment {
  amount: number;
  at: Date;
  by: string;
  /** Pul kassaga tushdimi / kassadan to'landimi (CashFlow yaratilgan) */
  toKassa: boolean;
}

export interface ILedgerEntry {
  type: LedgerType;
  personName: string;
  personPhone: string;
  amount: number;
  dueDate: Date;              // qaytarish kuni
  note?: string;
  status: LedgerStatus;
  /** Qaytarilgan jami (payments yig'indisi); qoldiq = amount − paidAmount */
  paidAmount: number;
  payments: ILedgerPayment[];
  /** Telefon bo'yicha topilgan mijoz (Mijozlar bo'limi) */
  customerId?: Types.ObjectId;
  /** Yozuv kassa orqali o'tgan bo'lsa — qaysi filial kassasi (CashFlow.ledgerEntryId bilan bog'langan) */
  kassaBranchId?: Types.ObjectId;
  branchId?: Types.ObjectId;  // scoping (qaysi profil kiritdi)
  createdBy: string;          // username (snapshot)
  createdByUserId?: string;   // shaxsiy Telegram eslatmasi uchun
  returnedAt?: Date;
  lastNotifiedAt?: Date;      // oxirgi kunlik eslatma sanasi (kunlik takrorlanmasligi uchun)
  createdAt?: Date;
  updatedAt?: Date;
}

export const ledgerEntrySchema = new Schema<ILedgerEntry>(
  {
    type: { type: String, enum: ['given', 'taken'], required: true, default: 'given' },
    personName: { type: String, required: true, trim: true },
    personPhone: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    dueDate: { type: Date, required: true },
    note: { type: String, trim: true, maxlength: 400 },
    status: { type: String, enum: ['open', 'returned'], default: 'open', index: true },
    paidAmount: { type: Number, default: 0, min: 0 },
    payments: {
      type: [{
        amount: { type: Number, required: true, min: 0 },
        at: { type: Date, required: true },
        by: { type: String, trim: true, required: true },
        toKassa: { type: Boolean, default: false },
      }],
      default: [],
    },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    kassaBranchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    createdBy: { type: String, trim: true, required: true },
    createdByUserId: { type: String, trim: true },
    returnedAt: { type: Date },
    lastNotifiedAt: { type: Date },
  },
  { timestamps: true, collection: 'ledger_entries' }
);

// O'chirish — soft-delete (deletedAt); o'chirilganlar so'rovlardan avtomatik yashiriladi
ledgerEntrySchema.plugin(softDeletePlugin);

ledgerEntrySchema.index({ status: 1, dueDate: 1 });
ledgerEntrySchema.index({ branchId: 1, createdAt: -1 });
ledgerEntrySchema.index({ customerId: 1 }, { sparse: true });
ledgerEntrySchema.index({ personPhone: 1 });

export const LEDGER_TYPE_LABELS: Record<LedgerType, string> = {
  given: 'Qarz berdim',
  taken: 'Qarz oldim',
};

export type LedgerEntryDoc = ILedgerEntry & { _id: Types.ObjectId };

/** Qaytarilmagan qoldiq (eski yozuvlarda paidAmount yo'q — 0) */
export function ledgerRemaining(e: Pick<ILedgerEntry, 'amount' | 'paidAmount'>): number {
  return Math.max(0, (e.amount || 0) - (e.paidAmount || 0));
}
