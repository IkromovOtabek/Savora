import { NextResponse } from 'next/server';
import { authenticateMobile } from '@/lib/mobileAuth';
import { getTenantModels } from '@/lib/tenantDb';
import { branchFilter, branchAggMatch } from '@/lib/branchScope';
import { parsePeriod, periodRange } from '@/lib/period';

export async function GET(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName) {
    return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  }
  const { Product, Sale } = await getTenantModels(user.dbName);
  const scope = branchFilter(user);
  const aggScope = branchAggMatch(user);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  // Bosh sahifa filtri (?p=all|yesterday|today|week|month|year|YYYY-MM-DD) — web bosh sahifasi bilan bir xil davrlar
  const period = parsePeriod(new URL(req.url).searchParams.get('p'));
  const { start, end } = periodRange(period, todayStart);
  const inPeriod = { createdAt: { $gte: start, $lt: end } };

  const [inStock, periodSales, periodRevenueAgg, debtAgg] = await Promise.all([
    Product.countDocuments({ ...scope, status: 'in_stock' }),
    Sale.countDocuments({ ...scope, ...inPeriod, status: { $ne: 'cancelled' } }),
    Sale.aggregate([
      { $match: { ...aggScope, ...inPeriod, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$paidAmount' } } },
    ]),
    Sale.aggregate([
      { $match: { ...aggScope, status: 'partial', paymentType: { $ne: 'bank_credit' } } },
      { $group: { _id: null, total: { $sum: '$remainingAmount' } } },
    ]),
  ]);

  const periodRevenue = periodRevenueAgg[0]?.total ?? 0;
  return NextResponse.json({
    inStock,
    period,
    periodSales,
    periodRevenue,
    // Eski ilova versiyalari uchun (p= yuborilmasa davr «bugun» — qiymat bir xil)
    todaySales: periodSales,
    todayRevenue: periodRevenue,
    debtTotal: debtAgg[0]?.total ?? 0,
  });
}
