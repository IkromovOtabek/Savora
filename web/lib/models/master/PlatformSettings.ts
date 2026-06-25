import { Schema } from 'mongoose';
import { PlanTier } from '../../plans';

export interface IPlanOverride {
  maxFilial?: number;
  maxUsers?: number;
  monthlyPrice?: number;
  label?: string;
  description?: string;
}

export interface IPlatformSettings {
  key: string;
  planOverrides?: Partial<Record<Exclude<PlanTier, 'custom'>, IPlanOverride>>;
  /** To'lov uchun hisob/karta — do'konlarga ko'rsatiladi */
  paymentCardNumber?: string;
  paymentCardHolder?: string;
  paymentNote?: string;
  updatedAt?: Date;
}

export const platformSettingsSchema = new Schema<IPlatformSettings>(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    planOverrides: { type: Schema.Types.Mixed },
    paymentCardNumber: { type: String, trim: true },
    paymentCardHolder: { type: String, trim: true },
    paymentNote: { type: String, trim: true },
  },
  { timestamps: true, collection: 'platform_settings' }
);
