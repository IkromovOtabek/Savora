/**
 * AI yordamchi — umumiy turlar. Bu fayl client'da ham ishlaydi (DB/tarmoq importi yo'q).
 *
 * MAXFIYLIK: AiSnapshot faqat AGREGAT ko'rsatkichlardan iborat — mijoz ismi, telefoni,
 * IMEI, xodim ismlari va boshqa shaxsiy ma'lumot bu turga KIRMAYDI va tashqariga yuborilmaydi.
 * Mahsulot va filial nomlari — biznes ma'lumoti (shaxsiy emas).
 */

export type AiHealth = 'yaxshi' | 'o\'rta' | 'xavfli';
export type AiPriority = 'yuqori' | 'o\'rta' | 'past';
export type AiRole = 'owner' | 'director' | 'seller' | 'cashier';
export type AiSource = 'ai' | 'rules';

export interface AiInsight {
  title: string;
  detail: string;
  metric?: string;
}

export interface AiRecommendation {
  title: string;
  detail: string;
  priority: AiPriority;
  impact: string;
}

export interface AiTask {
  title: string;
  detail: string;
  role: AiRole;
  dueInDays: number;
}

/** AI ham, qoidalar dvigateli ham AYNAN shu shaklni qaytaradi */
export interface AiResult {
  summary: string;
  health: AiHealth;
  insights: AiInsight[];
  recommendations: AiRecommendation[];
  tasks: AiTask[];
}

export interface AiDayPoint {
  /** YYYY-MM-DD */
  date: string;
  revenue: number;
  count: number;
}

export interface AiSnapshot {
  version: 1;
  generatedAt: string;
  currency: 'UZS';
  /** 'org' — barcha filiallar (egasi); 'branch' — bitta filial (filial login) */
  scope: 'org' | 'branch';
  businessType: string;
  periodDays: number;
  revenue: {
    /** Sotuv summasi (totalAmount), bekor qilinganlarsiz */
    total: number;
    /** Shu davrda sotuvlardan olingan pul (paidAmount) */
    collected: number;
    salesCount: number;
    avgCheck: number;
    byDay: AiDayPoint[];
    byPaymentType: { type: string; revenue: number; count: number }[];
  };
  week: {
    last7: number;
    prev7: number;
    salesLast7: number;
    salesPrev7: number;
    /** % o'zgarish (prev7 = 0 bo'lsa null) */
    changePct: number | null;
  };
  topProducts: { name: string; qty: number; revenue: number }[];
  stock: {
    inStockCount: number;
    lowStockCount: number;
    /** Qoldig'i oz (≤ chegara) sanaladigan mahsulotlar */
    lowStock: { name: string; left: number }[];
  };
  nasiya: {
    /** Barcha qoldiqli qarz/nasiya sotuvlari */
    count: number;
    totalRemaining: number;
    installmentCount: number;
    /** Faol nasiyalardagi eng uzun muddat (oy) — PQ-294 (≤12 oy) nazorati uchun */
    maxMonths: number;
    overdue: {
      count: number;
      amount: number;
      /** 0..1 — muddati o'tgan summa / jami qoldiq */
      share: number;
      buckets: { d1_30: number; d31_60: number; d61_90: number; d90p: number };
      bucketCounts: { d1_30: number; d31_60: number; d61_90: number; d90p: number };
    };
  };
  debtsDueSoon: { days: number; count: number; amount: number };
  branches: { name: string; isMain: boolean; revenue: number; salesLast7: number }[];
}

export const AI_HEALTH_LABELS: Record<AiHealth, string> = {
  yaxshi: 'Yaxshi',
  'o\'rta': 'O\'rta',
  xavfli: 'Xavfli',
};

export const AI_ROLE_LABELS: Record<AiRole, string> = {
  owner: 'Egasi',
  director: 'Filial rahbari',
  seller: 'Sotuvchi',
  cashier: 'Kassir',
};

/** Kunlik tahlillar chegarasi (bitta do'kon, barcha foydalanuvchilar) */
export const AI_DAILY_LIMIT = 10;
