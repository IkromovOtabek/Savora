import { Schema } from 'mongoose';
import type { RestaurantSettings } from '../../restaurant/types';
import { LABEL_FIELDS, LABEL_LIMITS, LABEL_TEXT_SIZES, type StoredLabelSettings } from '../../labels/settings';

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
    /** Ish vaqti (chekda): "09:00 – 18:00" */
    workHours?: string;
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
    /** Har bir sotuv — faqat mobil ilovaga push (Telegram'ga emas) */
    newSale: boolean;
  };
  /**
   * Restoran (lib/restaurant). QR-menyu manzili alohida saqlanmaydi — do'kon `slug` i ishlatiladi
   * (master bazada noyob): /m/<slug>/<stol qrToken>.
   */
  restaurant: RestaurantSettings;
  /** Ombor: «N kunda muddati tugaydi» ogohlantirishi (ro'yxatdan o'tish ustasi: oziq-ovqat 7, kosmetika 30, dori 90) */
  stock?: {
    expiryWarnDays?: number;
    /** Markirovkali tovar kassada: warn — kodsiz ham sotiladi (ogohlantirish), require — har donaga kod shart (lib/marking.ts) */
    markingMode?: 'warn' | 'require';
  };
  /**
   * E-commerce (lib/ecom): autoPublish — sotish narxi bor tovarlar o'zi chiqadi (sukut: yoqiq); o'chiq bo'lsa —
   * faqat egasi belgilaganlari. note — xaridorga ko'rinadigan yetkazish/olib ketish shartlari.
   */
  ecom?: {
    autoPublish?: boolean;
    note?: string;
  };
  /** Barkod yorlig'i (lib/labels): o'lcham, maydonlar, nusxa, qo'shilgach avto-chop etish. Yo'q — biznes turiga qarab sukut */
  label?: StoredLabelSettings;
  /**
   * Restoran menyusi ma'lumot versiyasi: 1 — mahsulotlarda `menuItem` belgisi qo'yilgan (menyu va ombor ajratilgan).
   * Yo'q — hali migratsiya qilinmagan (lib/restaurant/menuFlags.ts → ensureMenuFlags birinchi ochilganda qo'yadi).
   */
  menuVersion?: number;
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
      workHours: { type: String, trim: true, maxlength: 40 },
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
      newSale: { type: Boolean, default: false },
    },
    restaurant: {
      serviceChargePct: { type: Number, min: 0, max: 30 },
      takeawayPackFee: { type: Number, min: 0 },
      requireVoidReason: { type: Boolean },
      kdsWarnMinutes: { type: Number, min: 1, max: 240 },
      kdsAlertMinutes: { type: Number, min: 1, max: 480 },
      // Taom kam qolganda bildirishnoma chegarasi (porsiya; 0 — o'chiq) — lib/restaurant/stockAlerts.ts
      lowPortions: { type: Number, min: 0, max: 1000 },
      brand: {
        logoUrl: { type: String, trim: true, maxlength: 500 },
        color: { type: String, trim: true, maxlength: 7 },
        coverUrl: { type: String, trim: true, maxlength: 500 },
      },
      // Mijoz sahifasi (/m/<slug>) — chegaralar lib/restaurant/info.ts → INFO_LIMITS bilan bir xil
      info: {
        about: { type: String, trim: true, maxlength: 300 },
        address: { type: String, trim: true, maxlength: 160 },
        phone: { type: String, trim: true, maxlength: 24 },
        workHours: { type: String, trim: true, maxlength: 80 },
        instagram: { type: String, trim: true, maxlength: 30 },
        telegram: { type: String, trim: true, maxlength: 32 },
        takeawayByPhone: { type: Boolean },
      },
    },
    stock: {
      expiryWarnDays: { type: Number, min: 1, max: 365 },
      markingMode: { type: String, enum: ['warn', 'require'] },
    },
    ecom: {
      autoPublish: { type: Boolean },
      note: { type: String, trim: true, maxlength: 300 },
    },
    label: {
      width: { type: Number, min: LABEL_LIMITS.minW, max: LABEL_LIMITS.maxW },
      height: { type: Number, min: LABEL_LIMITS.minH, max: LABEL_LIMITS.maxH },
      fields: { type: [{ type: String, enum: LABEL_FIELDS }], default: undefined },
      textSize: { type: String, enum: LABEL_TEXT_SIZES },
      copies: { type: Number, min: 1, max: LABEL_LIMITS.maxCopies },
      autoPrint: { type: Boolean },
    },
    menuVersion: { type: Number, min: 0 },
    updatedBy: { type: String },
  },
  { timestamps: true, collection: 'shop_settings' }
);

shopSettingsSchema.index({ key: 1 }, { unique: true });
