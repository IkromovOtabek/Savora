import { Schema, Types } from 'mongoose';

/** Daftar yozuvi — shaxsiy qarz oldi-berdi. */
export type LedgerType = 'given' | 'taken'; // given = qarz berdim; taken = qarz oldim
export type LedgerStatus = 'open' | 'returned';

export interface ILedgerEntry {
  type: LedgerType;
  personName: string;
  personPhone: string;
  amount: number;
  dueDate: Date;              // qaytarish kuni
  note?: string;
  status: LedgerStatus;
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
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    createdBy: { type: String, trim: true, required: true },
    createdByUserId: { type: String, trim: true },
    returnedAt: { type: Date },
    lastNotifiedAt: { type: Date },
  },
  { timestamps: true, collection: 'ledger_entries' }
);

ledgerEntrySchema.index({ status: 1, dueDate: 1 });
ledgerEntrySchema.index({ branchId: 1, createdAt: -1 });

export const LEDGER_TYPE_LABELS: Record<LedgerType, string> = {
  given: 'Qarz berdim',
  taken: 'Qarz oldim',
};

export type LedgerEntryDoc = ILedgerEntry & { _id: Types.ObjectId };
