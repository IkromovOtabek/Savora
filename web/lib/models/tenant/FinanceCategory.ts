import { Schema, Types } from 'mongoose';
import type { CashFlowType } from './CashFlow';

/** Moliyaviy toifa (BILLZ: "Moliyaviy toifalar") — kirim/chiqim yozuvlarini guruhlash uchun */
export interface IFinanceCategory {
  name: string;
  type: CashFlowType;
  active: boolean;
  /** Tizim toifasi (kassa operatsiyalari uchun) — o'chirib/o'zgartirib bo'lmaydi */
  system?: boolean;
  /**
   * Sof foydaga ta'sir qiladimi (xarajat ayiriladi, kirim qo'shiladi).
   * Yo'q bo'lsa (eski yozuv) — `categoryInProfit` qoidasi: tizim toifalari va «Investitsiya» — yo'q, qolgani — ha.
   */
  inProfit?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export const financeCategorySchema = new Schema<IFinanceCategory>(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    type: { type: String, enum: ['income', 'expense'], required: true },
    active: { type: Boolean, default: true },
    system: { type: Boolean, default: false },
    inProfit: { type: Boolean },
  },
  { timestamps: true, collection: 'finance_categories' }
);

financeCategorySchema.index({ type: 1, name: 1 }, { unique: true });

/** Smena ichidagi kassa operatsiyalari toifalari (tizim) */
export const SHIFT_DEPOSIT_CATEGORY = "Kassaga qo'shildi";
export const SHIFT_WITHDRAW_CATEGORY = 'Kassadan olindi';

/** Egasining kiritgan puli — kirim, lekin foyda emas */
export const INVESTMENT_CATEGORY = 'Investitsiya';

/**
 * Toifa sof foydaga ta'sir qiladimi. Tizim toifalari (kassaga pul qo'shish/olish) — pul ko'chishi,
 * foyda emas; «Investitsiya» — egasining puli. Belgi qo'yilgan bo'lsa — o'sha (tizimdan tashqari).
 */
export function categoryInProfit(c: Pick<IFinanceCategory, 'name' | 'system' | 'inProfit'>): boolean {
  if (c.system) return false;
  if (typeof c.inProfit === 'boolean') return c.inProfit;
  return c.name !== INVESTMENT_CATEGORY;
}

/** Do'konda toifa bo'lmasa — boshlang'ich to'plam */
export const DEFAULT_FINANCE_CATEGORIES: { name: string; type: 'income' | 'expense'; system?: boolean }[] = [
  { name: 'Ijara', type: 'expense' },
  { name: 'Kommunal xizmatlar', type: 'expense' },
  { name: 'Ish haqi', type: 'expense' },
  { name: 'Soliq', type: 'expense' },
  { name: 'Transport', type: 'expense' },
  { name: 'Reklama', type: 'expense' },
  { name: 'Boshqa xarajat', type: 'expense' },
  { name: SHIFT_WITHDRAW_CATEGORY, type: 'expense', system: true },
  { name: INVESTMENT_CATEGORY, type: 'income' },
  { name: 'Boshqa kirim', type: 'income' },
  { name: SHIFT_DEPOSIT_CATEGORY, type: 'income', system: true },
];

export type FinanceCategoryDoc = IFinanceCategory & { _id: Types.ObjectId };
