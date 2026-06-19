import { Schema, Types } from 'mongoose';
import { OrgFeatures } from '../../featureKeys';
import { BusinessType } from '../../businessTypes';

export interface IOrganization {
  name: string;
  slug: string;
  dbName: string;
  ownerName?: string;
  phone?: string;
  adminUsername?: string;
  businessType: BusinessType;
  status: 'active' | 'suspended' | 'expired';
  expiresAt: Date;
  plan: {
    tier: string;
    maxFilial: number;
    maxUsers: number;
    maxProducts?: number;
    monthlyPayment?: number;
    yearlyPayment?: number;
    billingCycle?: 'monthly' | 'yearly';
    agreementNote?: string;
  };
  features?: Partial<OrgFeatures>;
  /** Referral tizim */
  referralCode?: string;
  referredBy?: string;
  referralBonusMonths?: number;
  /** Onboarding: birinchi qadamlar bajarilganmi */
  onboarding?: {
    branchCreated?: boolean;
    productAdded?: boolean;
    saleMade?: boolean;
    profileCompleted?: boolean;
  };
  /** Oxirgi kunlik telegram eslatma (YYYY-MM-DD) */
  notifyExpiryOn?: string;
  /** Telegram chat ID (do'kon admini ulagan bo'lsa) */
  telegramChatId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const organizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    dbName: { type: String, required: true, unique: true },
    ownerName: { type: String, trim: true },
    phone: { type: String, trim: true },
    adminUsername: { type: String, trim: true, lowercase: true },
    businessType: {
      type: String,
      enum: ['general', 'phone_shop', 'restaurant', 'wholesale', 'service', 'pharmacy', 'auto_parts'],
      default: 'general',
    },
    status: { type: String, enum: ['active', 'suspended', 'expired'], default: 'active' },
    expiresAt: { type: Date, required: true },
    plan: {
      tier: { type: String, default: 'free' },
      maxFilial: { type: Number, default: 1 },
      maxUsers: { type: Number, default: 2 },
      maxProducts: { type: Number, default: 50 },
      monthlyPayment: { type: Number },
      yearlyPayment: { type: Number },
      billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
      agreementNote: { type: String, trim: true },
    },
    features: {
      sales: { type: Boolean },
      kassa: { type: Boolean },
      monitoring: { type: Boolean },
      products: { type: Boolean },
      users: { type: Boolean },
      export: { type: Boolean },
      customers: { type: Boolean },
      inventory: { type: Boolean },
      mediaUpload: { type: Boolean },
      variant: { type: Boolean },
      creditKassa: { type: Boolean },
      kirimChiqim: { type: Boolean },
    },
    referralCode: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
    referredBy: { type: String, trim: true },
    referralBonusMonths: { type: Number, default: 0 },
    onboarding: {
      branchCreated: { type: Boolean, default: false },
      productAdded: { type: Boolean, default: false },
      saleMade: { type: Boolean, default: false },
      profileCompleted: { type: Boolean, default: false },
    },
    notifyExpiryOn: { type: String },
    telegramChatId: { type: String },
  },
  { timestamps: true, collection: 'organizations' }
);

organizationSchema.index({ referralCode: 1 }, { sparse: true });
organizationSchema.index({ status: 1, expiresAt: 1 });

export function isOrganizationActive(org: Pick<IOrganization, 'status' | 'expiresAt'>): boolean {
  if (org.status !== 'active') return false;
  return new Date(org.expiresAt).getTime() > Date.now();
}

/** Bepul tarif ekanligini tekshirish */
export function isFreePlan(org: Pick<IOrganization, 'plan'>): boolean {
  return org.plan.tier === 'free';
}

/** Onboarding tugallanganligini tekshirish */
export function isOnboardingComplete(org: Pick<IOrganization, 'onboarding'>): boolean {
  const o = org.onboarding;
  if (!o) return false;
  return !!(o.branchCreated && o.productAdded && o.saleMade);
}

/** Onboarding foizi */
export function onboardingProgress(org: Pick<IOrganization, 'onboarding'>): number {
  const o = org.onboarding;
  if (!o) return 0;
  const steps = [o.branchCreated, o.productAdded, o.saleMade, o.profileCompleted];
  return Math.round((steps.filter(Boolean).length / steps.length) * 100);
}
