import { Schema } from 'mongoose';

/**
 * Do'kon sozlamalari (BILLZ: "Sozlamalar") — do'konda bitta hujjat (key: 'main').
 * Chek ko'rinishi, dollar kursi va Telegram bildirishnomalari shu yerda.
 */
export interface IShopSettings {
  key: 'main';
  receipt: {
    /** Sarlavha ostidagi matn: manzil, mo'ljal va h.k. */
    headerNote?: string;
    /** Pastki matn — bo'sh bo'lsa standart "Xaridingiz uchun rahmat!" */
    footer?: string;
    paperWidth: 58 | 80;
    showSeller: boolean;
    showCustomer: boolean;
  };
  currency: {
    /** cbu — Markaziy bank kursi; manual — egasi kiritgan kurs */
    rateMode: 'cbu' | 'manual';
    manualRate?: number;
    cbuRate?: number;
    /** CBU kursi sanasi (YYYY-MM-DD, bank e'lon qilgan) */
    cbuDate?: string;
    cbuFetchedAt?: Date;
  };
  notify: {
    dailySummary: boolean;
    shiftDiff: boolean;
  };
  updatedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const shopSettingsSchema = new Schema<IShopSettings>(
  {
    key: { type: String, default: 'main', enum: ['main'] },
    receipt: {
      headerNote: { type: String, trim: true, maxlength: 120 },
      footer: { type: String, trim: true, maxlength: 160 },
      paperWidth: { type: Number, enum: [58, 80], default: 80 },
      showSeller: { type: Boolean, default: true },
      showCustomer: { type: Boolean, default: true },
    },
    currency: {
      rateMode: { type: String, enum: ['cbu', 'manual'], default: 'cbu' },
      manualRate: { type: Number, min: 0 },
      cbuRate: { type: Number, min: 0 },
      cbuDate: { type: String },
      cbuFetchedAt: { type: Date },
    },
    notify: {
      dailySummary: { type: Boolean, default: false },
      shiftDiff: { type: Boolean, default: true },
    },
    updatedBy: { type: String },
  },
  { timestamps: true, collection: 'shop_settings' }
);

shopSettingsSchema.index({ key: 1 }, { unique: true });
