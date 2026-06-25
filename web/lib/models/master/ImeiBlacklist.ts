import { Schema, Types } from 'mongoose';

/**
 * IMEI qora ro'yxat — qarzdor yoki firibgar bilan bog'liq qurilmalar.
 * Master bazada: BARCHA do'konlar qidiruvda ogohlantirish ko'radi (tarmoq effekti).
 */
export type BlacklistReason = 'debt' | 'fraud' | 'stolen' | 'other';

export interface IImeiBlacklist {
  imei: string;
  reason: BlacklistReason;
  organizationId: Types.ObjectId;
  orgName: string;          // qora ro'yxatga qo'shgan do'kon (snapshot)
  orgSlug: string;
  customerName?: string;    // qarzdor/firibgar ismi
  customerPhone?: string;
  note?: string;
  resolved: boolean;        // qarz yopilgan / hal qilingan
  resolvedAt?: Date;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const imeiBlacklistSchema = new Schema<IImeiBlacklist>(
  {
    imei: { type: String, required: true, uppercase: true, trim: true, index: true },
    reason: { type: String, enum: ['debt', 'fraud', 'stolen', 'other'], required: true, default: 'debt' },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    orgName: { type: String, required: true },
    orgSlug: { type: String, required: true },
    customerName: { type: String, trim: true },
    customerPhone: { type: String, trim: true },
    note: { type: String, trim: true, maxlength: 400 },
    resolved: { type: Boolean, default: false },
    resolvedAt: { type: Date },
    createdBy: { type: String, trim: true },
  },
  { timestamps: true, collection: 'imei_blacklist' }
);

imeiBlacklistSchema.index({ imei: 1, resolved: 1 });

export const BLACKLIST_REASON_LABELS: Record<BlacklistReason, string> = {
  debt: 'Qarzdorlik',
  fraud: 'Firibgarlik',
  stolen: 'O\'g\'irlangan',
  other: 'Boshqa',
};

export type ImeiBlacklistDoc = IImeiBlacklist & { _id: Types.ObjectId };
