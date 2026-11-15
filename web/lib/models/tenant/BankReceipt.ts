import { Schema, Types } from 'mongoose';
import { softDeletePlugin } from '../../softDelete';

/**
 * Bankdan olingan pul — bank krediti sotuvlari uchun bank do'konga o'tkazgan summa.
 * Bank qoldig'i = sotuvlardagi bank ulushlari (Kiritilgan) − shu yozuvlar (Olingan); manfiy bo'lishi mumkin.
 */
export interface IBankReceipt {
  bankId: Types.ObjectId;
  /** Bank nomi (snapshot) — sotuvlar bank nomi bo'yicha bog'langan */
  bankName: string;
  amount: number;
  receivedAt: Date;
  note?: string;
  /** Pul qaysi filialning naqd kassasiga tushdi (yo'q — eski yozuv, faqat jami kassada) */
  branchId?: Types.ObjectId;
  recordedBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const bankReceiptSchema = new Schema<IBankReceipt>(
  {
    bankId: { type: Schema.Types.ObjectId, ref: 'CreditBank', required: true },
    bankName: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 1 },
    receivedAt: { type: Date, required: true, default: Date.now },
    note: { type: String, trim: true, maxlength: 300 },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    recordedBy: { type: String, required: true, trim: true },
  },
  { timestamps: true, collection: 'bank_receipts' }
);

// Xato yozuv o'chirilsa — soft-delete (audit uchun saqlanadi)
bankReceiptSchema.plugin(softDeletePlugin);

bankReceiptSchema.index({ bankId: 1, receivedAt: -1 });
bankReceiptSchema.index({ receivedAt: -1 });
bankReceiptSchema.index({ branchId: 1, receivedAt: -1 }); // naqd kassa (filial bo'yicha)
