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
  updatedAt?: Date;
}

export const platformSettingsSchema = new Schema<IPlatformSettings>(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    planOverrides: { type: Schema.Types.Mixed },
  },
  { timestamps: true, collection: 'platform_settings' }
);
