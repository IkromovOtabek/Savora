import { createHash } from 'crypto';
import type { getTenantModels } from '../tenantDb';
import type { SessionUser } from '../session';
import { branchAggMatch, branchFilter } from '../branchScope';
import { computeInstallmentPlan } from '../installment';
import { dayBoundaries } from '../weekBuckets';
import type { AiSnapshot } from './types';

/**
 * AI tahlili uchun AGREGAT ko'rsatkichlar ("snapshot").
 *
 * MAXFIYLIK QOIDASI (o'zgartirmang):
 *  - Bu yerdan faqat yig'indi, son, o'rtacha va mahsulot/filial NOMLARI chiqadi.
 *  - Mijoz ismi, telefoni, IMEI, sotuv raqami, xodim username'lari, izohlar — CHIQMAYDI.
 *    (Sale.customerSnapshot / productSnapshot.imei / payments.note faqat server ichida
 *    hisob uchun o'qiladi va natijaga yozilmaydi.)
 *  - Filial login (role 'user') — faqat o'z filiali; egasi — barcha filiallar.
 */

type TenantModels = Awaited<ReturnType<typeof getTenantModels>>;
type ScopeUser = Pick<SessionUser, 'role' | 'branchId'>;

const PERIOD_DAYS = 30;
const LOW_STOCK_LEFT = 3;
const DUE_SOON_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Mahalliy kun kaliti: YYYY-MM-DD */
export function dayKey(d: Date = new Date()): string {
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Kesh kaliti: egasi — 'all', filial login — filial id */
export function scopeKeyOf(user: ScopeUser): string {
  return user.role === 'user' && user.branchId ? user.branchId : 'all';
}

export interface OverdueItem {
  daysOverdue: number;
  amount: number;
}

/** Muddati o'tgan qarzlarni kechikish kunlari bo'yicha savatlarga ajratadi (1-30, 31-60, 61-90, 90+) */
export function overdueBuckets(items: OverdueItem[]) {
  const buckets = { d1_30: 0, d31_60: 0, d61_90: 0, d90p: 0 };
  const bucketCounts = { d1_30: 0, d31_60: 0, d61_90: 0, d90p: 0 };
  for (const it of items) {
    if (it.daysOverdue < 1 || it.amount <= 0) continue;
    const k = it.daysOverdue <= 30 ? 'd1_30' : it.daysOverdue <= 60 ? 'd31_60' : it.daysOverdue <= 90 ? 'd61_90' : 'd90p';
    buckets[k] += it.amount;
    bucketCounts[k] += 1;
  }
  return { buckets, bucketCounts };
}

export function pctChange(cur: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

/** Snapshot xeshi (generatedAt'siz) — ma'lumot o'zgarmagan bo'lsa qayta AI chaqirilmaydi */
export function snapshotHash(s: AiSnapshot): string {
  const { generatedAt: _g, ...rest } = s;
  void _g;
  return createHash('sha256').update(JSON.stringify(rest)).digest('hex').slice(0, 32);
}

type SaleForNasiya = {
  paymentType: string;
  remainingAmount: number;
  totalAmount: number;
  paidAmount: number;
  installmentMonths?: number;
  downPayment?: number;
  payments?: { amount: number; paidAt: Date; note?: string }[];
  createdAt?: Date;
  dueDate?: Date;
};

/** Qarz/nasiya portfeli (sof funksiya — test qilinadi) */
export function nasiyaPortfolio(sales: SaleForNasiya[], now: Date = new Date()) {
  const nowT = now.getTime();
  const soonT = nowT + DUE_SOON_DAYS * DAY_MS;
  const overdueItems: OverdueItem[] = [];
  let totalRemaining = 0;
  let installmentCount = 0;
  let maxMonths = 0;
  let dueSoonCount = 0;
  let dueSoonAmount = 0;

  for (const s of sales) {
    if (!(s.remainingAmount > 0)) continue;
    totalRemaining += s.remainingAmount;
    if (s.paymentType === 'installment') {
      installmentCount += 1;
      maxMonths = Math.max(maxMonths, s.installmentMonths ?? 0);
      const plan = computeInstallmentPlan(s as Parameters<typeof computeInstallmentPlan>[0], now);
      if (!plan) continue;
      const unpaid = plan.schedule.filter((m) => !m.paid);
      const overdue = unpaid.filter((m) => m.dueDate.getTime() <= nowT);
      if (overdue.length > 0) {
        const amount = overdue.reduce((a, m) => a + Math.max(0, m.amount - m.paidAmount), 0);
        const days = Math.floor((nowT - overdue[0].dueDate.getTime()) / DAY_MS);
        overdueItems.push({ daysOverdue: Math.max(1, days), amount: Math.min(amount, s.remainingAmount) });
      }
      const next = unpaid.find((m) => m.dueDate.getTime() > nowT);
      if (next && next.dueDate.getTime() <= soonT) {
        dueSoonCount += 1;
        dueSoonAmount += Math.max(0, next.amount - next.paidAmount);
      }
    } else if (s.dueDate) {
      const dueT = new Date(s.dueDate).getTime();
      if (dueT < nowT) {
        overdueItems.push({ daysOverdue: Math.max(1, Math.floor((nowT - dueT) / DAY_MS)), amount: s.remainingAmount });
      } else if (dueT <= soonT) {
        dueSoonCount += 1;
        dueSoonAmount += s.remainingAmount;
      }
    }
  }

  const { buckets, bucketCounts } = overdueBuckets(overdueItems);
  const overdueAmount = overdueItems.reduce((a, x) => a + x.amount, 0);
  return {
    nasiya: {
      count: sales.filter((s) => s.remainingAmount > 0).length,
      totalRemaining,
      installmentCount,
      maxMonths,
      overdue: {
        count: overdueItems.length,
        amount: overdueAmount,
        share: totalRemaining > 0 ? Math.round((overdueAmount / totalRemaining) * 1000) / 1000 : 0,
        buckets,
        bucketCounts,
      },
    },
    debtsDueSoon: { days: DUE_SOON_DAYS, count: dueSoonCount, amount: dueSoonAmount },
  };
}

/** Tashkilot (yoki filial) bo'yicha agregat snapshot */
export async function buildSnapshot(
  models: Pick<TenantModels, 'Sale' | 'Product' | 'Branch'>,
  user: ScopeUser,
  opts: { businessType?: string; now?: Date } = {},
): Promise<AiSnapshot> {
  const { Sale, Product, Branch } = models;
  const now = opts.now ?? new Date();
  const scope = branchFilter(user);
  const aggScope = branchAggMatch(user);
  const bounds = dayBoundaries(now, PERIOD_DAYS);
  const from = bounds[0];
  const to = bounds[bounds.length - 1];
  const last7Start = bounds[PERIOD_DAYS - 7];
  const notCancelled = { status: { $ne: 'cancelled' } };
  const periodMatch = { ...aggScope, ...notCancelled, createdAt: { $gte: from, $lt: to } };

  const [dayAgg, payAgg, topAgg, branchAgg, inStockCount, lowStockAgg, lowStockCount, openSales, branchDocs] = await Promise.all([
    Sale.aggregate<{ _id: Date | string; revenue: number; collected: number; count: number }>([
      { $match: periodMatch },
      {
        $bucket: {
          groupBy: '$createdAt',
          boundaries: bounds,
          default: 'other',
          output: { revenue: { $sum: '$totalAmount' }, collected: { $sum: '$paidAmount' }, count: { $sum: 1 } },
        },
      },
    ]),
    Sale.aggregate<{ _id: string; revenue: number; count: number }>([
      { $match: periodMatch },
      { $group: { _id: '$paymentType', revenue: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      { $sort: { revenue: -1 } },
    ]),
    Sale.aggregate<{ _id: string; revenue: number; qty: number }>([
      { $match: periodMatch },
      {
        $group: {
          _id: '$productSnapshot.name',
          revenue: { $sum: '$totalAmount' },
          qty: { $sum: { $ifNull: ['$productSnapshot.saleQuantity', 1] } },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
    ]),
    Sale.aggregate<{ _id: unknown; revenue: number; salesLast7: number }>([
      { $match: periodMatch },
      {
        $group: {
          _id: '$branchId',
          revenue: { $sum: '$totalAmount' },
          salesLast7: { $sum: { $cond: [{ $gte: ['$createdAt', last7Start] }, 1, 0] } },
        },
      },
    ]),
    Product.countDocuments({ ...scope, status: 'in_stock' }),
    Product.aggregate<{ name: string; left: number }>([
      { $match: { ...aggScope, status: 'in_stock', trackQuantity: true } },
      { $project: { _id: 0, name: 1, left: { $subtract: ['$quantity', '$soldQuantity'] } } },
      { $match: { left: { $lte: LOW_STOCK_LEFT } } },
      { $sort: { left: 1 } },
      { $limit: 10 },
    ]),
    Product.countDocuments({
      ...scope,
      status: 'in_stock',
      trackQuantity: true,
      $expr: { $lte: [{ $subtract: ['$quantity', '$soldQuantity'] }, LOW_STOCK_LEFT] },
    }),
    // Faqat hisob uchun maydonlar — mijoz ma'lumoti so'ralmaydi
    Sale.find({ ...scope, status: 'partial', remainingAmount: { $gt: 0 } })
      .select('paymentType remainingAmount totalAmount paidAmount installmentMonths downPayment payments.amount payments.paidAt payments.note createdAt dueDate')
      .limit(5000)
      .lean<SaleForNasiya[]>(),
    Branch.find(user.role === 'user' && user.branchId ? { _id: user.branchId } : { active: true })
      .select('name isMain')
      .lean(),
  ]);

  // Kunlik qatorlar (bo'sh kunlar 0)
  const byTime = new Map<number, { revenue: number; collected: number; count: number }>();
  for (const b of dayAgg) {
    const t = new Date(b._id as Date).getTime();
    if (!Number.isNaN(t)) byTime.set(t, { revenue: b.revenue, collected: b.collected, count: b.count });
  }
  const byDay = bounds.slice(0, -1).map((d) => {
    const v = byTime.get(d.getTime()) ?? { revenue: 0, collected: 0, count: 0 };
    return { date: dayKey(d), revenue: v.revenue, count: v.count, collected: v.collected };
  });
  const total = byDay.reduce((a, d) => a + d.revenue, 0);
  const collected = byDay.reduce((a, d) => a + d.collected, 0);
  const salesCount = byDay.reduce((a, d) => a + d.count, 0);
  const sum = (arr: typeof byDay) => arr.reduce((a, d) => a + d.revenue, 0);
  const cnt = (arr: typeof byDay) => arr.reduce((a, d) => a + d.count, 0);
  const last7 = byDay.slice(-7);
  const prev7 = byDay.slice(-14, -7);

  const branchRev = new Map(branchAgg.map((b) => [String(b._id), b]));
  const branches = branchDocs.map((b) => {
    const r = branchRev.get(String(b._id));
    return { name: b.name, isMain: !!b.isMain, revenue: r?.revenue ?? 0, salesLast7: r?.salesLast7 ?? 0 };
  }).sort((a, b) => b.revenue - a.revenue);

  const portfolio = nasiyaPortfolio(openSales, now);

  return {
    version: 1,
    generatedAt: now.toISOString(),
    currency: 'UZS',
    scope: user.role === 'user' && user.branchId ? 'branch' : 'org',
    businessType: opts.businessType ?? 'general',
    periodDays: PERIOD_DAYS,
    revenue: {
      total,
      collected,
      salesCount,
      avgCheck: salesCount > 0 ? Math.round(total / salesCount) : 0,
      byDay: byDay.map(({ date, revenue, count }) => ({ date, revenue, count })),
      byPaymentType: payAgg.map((p) => ({ type: String(p._id), revenue: p.revenue, count: p.count })),
    },
    week: {
      last7: sum(last7),
      prev7: sum(prev7),
      salesLast7: cnt(last7),
      salesPrev7: cnt(prev7),
      changePct: pctChange(sum(last7), sum(prev7)),
    },
    topProducts: topAgg.filter((p) => p._id).map((p) => ({ name: String(p._id).slice(0, 80), qty: p.qty, revenue: p.revenue })),
    stock: {
      inStockCount,
      lowStockCount,
      lowStock: lowStockAgg.map((p) => ({ name: String(p.name).slice(0, 80), left: Math.max(0, p.left) })),
    },
    ...portfolio,
    branches,
  };
}
