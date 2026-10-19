import { Schema, Types } from 'mongoose';
import { FEATURE_KEYS, FeatureKey, OrgFeatures } from '../../featureKeys';
import { BUSINESS_TYPE_IDS, BusinessType } from '../../businessTypes';

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
    /** Sinov (trial) rejimi — muddati tugagach to'lov talab qilinadi */
    isTrial?: boolean;
  };
  features?: Partial<OrgFeatures>;
  /** Referral tizim */
  referralCode?: string;
  referredBy?: string;
  /** Ro'yxatdan o'tishda oferta va maxfiylik siyosatiga rozilik vaqti (aksept dalili) */
  termsAcceptedAt?: Date;
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
  /** Egasi ilovadan hisobni o'chirishni so'ragan vaqt (App Store 5.1.1(v)); do'kon shu zahoti to'xtatiladi */
  deletionRequestedAt?: Date;
  /** Do'kon ichidagi loginlar nusxasi (super admin ko'rishi uchun) — manba tenant DB */
  users?: {
    username: string;
    name?: string;
    role?: 'admin' | 'user';
    branchId?: string;
    createdAt?: Date;
  }[];
  createdAt?: Date;
  updatedAt?: Date;
}

// Modul (feature) bayroqlari — YAGONA MANBA: FEATURE_KEYS.
// Sxema shu ro'yxatdan generatsiya qilinadi, shuning uchun yangi modul qo'shilsa
// avtomatik qamrab olinadi va qo'lda unutib qo'yish (schema "drift") mumkin emas.
// Ilgari bu blok qo'lda yozilgani uchun `daftar` tushib qolib, Super Admin yoqsa ham
// Mongoose strict rejimi uni jimgina o'chirib tashlar edi.
const featureFlags = FEATURE_KEYS.reduce(
  (acc, key) => {
    acc[key] = { type: Boolean };
    return acc;
  },
  {} as Record<FeatureKey, { type: BooleanConstructor }>,
);

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
      enum: [...BUSINESS_TYPE_IDS],
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
      isTrial: { type: Boolean, default: false },
    },
    features: featureFlags,
    referralCode: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
    referredBy: { type: String, trim: true },
    termsAcceptedAt: { type: Date },
    referralBonusMonths: { type: Number, default: 0 },
    onboarding: {
      branchCreated: { type: Boolean, default: false },
      productAdded: { type: Boolean, default: false },
      saleMade: { type: Boolean, default: false },
      profileCompleted: { type: Boolean, default: false },
    },
    notifyExpiryOn: { type: String },
    telegramChatId: { type: String },
    deletionRequestedAt: { type: Date },
    users: {
      type: [
        {
          _id: false,
          username: { type: String },
          name: { type: String },
          role: { type: String, enum: ['admin', 'user'] },
          branchId: { type: String },
          createdAt: { type: Date },
        },
      ],
      default: [],
    },
  },
  { timestamps: true, collection: 'organizations' }
);

// referralCode indeksi field'da `unique: true, sparse: true` orqali allaqachon yaratiladi —
// bu yerda takrorlamaymiz (Mongoose "Duplicate schema index" ogohlantirishini oldini oladi).
organizationSchema.index({ status: 1, expiresAt: 1 });

export function isOrganizationActive(org: Pick<IOrganization, 'status' | 'expiresAt'>): boolean {
  if (org.status !== 'active') return false;
  return new Date(org.expiresAt).getTime() > Date.now();
}

/** Muddat tugashiga necha kun qolgani (o'tgan bo'lsa manfiy) */
export function daysUntilExpiry(org: Pick<IOrganization, 'expiresAt'>): number {
  const ms = new Date(org.expiresAt).getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/** Trial faolmi (sinov rejimi va muddat tugamagan) */
export function isTrialActive(org: Pick<IOrganization, 'status' | 'expiresAt' | 'plan'>): boolean {
  return !!org.plan?.isTrial && isOrganizationActive(org);
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
