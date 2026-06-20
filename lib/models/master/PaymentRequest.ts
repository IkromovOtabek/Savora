import { Schema, Types } from 'mongoose';

/**
 * To'lov so'rovi — do'kon pul o'tkazib, chek/screenshot yuklaydi.
 * Super admin tekshirib tasdiqlaydi → obuna muddati uzayadi.
 */
export type PaymentStatus = 'pending' | 'approved' | 'rejected';

export interface IPaymentRequest {
  organizationId: Types.ObjectId;
  orgName: string;   // snapshot (super admin ro'yxatda ko'rishi uchun)
  orgSlug: string;
  amount: number;
  /** Mijoz ko'rsatgan to'lov sanasi */
  paidAt: Date;
  /** Necha oyga (1 yoki 12) */
  months: number;
  /** Yuklangan chek/screenshot URL (R2 yoki lokal) */
  receiptUrl: string;
  note?: string;
  status: PaymentStatus;
  /** Tekshiruv natijasi */
  reviewNote?: string;
  reviewedBy?: string;
  reviewedAt?: Date;
  /** Avtomatik tekshiruv ogohlantirishlari (summa kam, sana kelajakda, dublikat...) */
  flags?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export const paymentRequestSchema = new Schema<IPaymentRequest>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    orgName: { type: String, required: true },
    orgSlug: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    paidAt: { type: Date, required: true },
    months: { type: Number, required: true, min: 1, default: 1 },
    receiptUrl: { type: String, required: true },
    note: { type: String, trim: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    reviewNote: { type: String, trim: true },
    reviewedBy: { type: String, trim: true },
    reviewedAt: { type: Date },
    flags: { type: [String], default: [] },
  },
  { timestamps: true, collection: 'payment_requests' }
);

paymentRequestSchema.index({ status: 1, createdAt: -1 });
paymentRequestSchema.index({ organizationId: 1, createdAt: -1 });

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Kutilmoqda',
  approved: 'Tasdiqlangan',
  rejected: 'Rad etilgan',
};

export type PaymentRequestDoc = IPaymentRequest & { _id: Types.ObjectId };
