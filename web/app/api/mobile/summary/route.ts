import { NextResponse } from 'next/server';
import { verifyMobileToken } from '@/lib/mobileAuth';
import { getTenantModels } from '@/lib/tenantDb';
import { branchFilter, branchAggMatch } from '@/lib/branchScope';

export async function GET(req: Request) {
  const user = await verifyMobileToken(req);
  if (!user || !user.dbName) {
    return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  }
  const { Product, Sale } = await getTenantModels(user.dbName);
  const scope = branchFilter(user);
  const aggScope = branchAggMatch(user);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [inStock, todaySales, todayRevenueAgg, debtAgg] = await Promise.all([
    Product.countDocuments({ ...scope, status: 'in_stock' }),
    Sale.countDocuments({ ...scope, createdAt: { $gte: todayStart }, status: { $ne: 'cancelled' } }),
    Sale.aggregate([
      { $match: { ...aggScope, createdAt: { $gte: todayStart }, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$paidAmount' } } },
    ]),
    Sale.aggregate([
      { $match: { ...aggScope, status: 'partial' } },
      { $group: { _id: null, total: { $sum: '$remainingAmount' } } },
    ]),
  ]);

  return NextResponse.json({
    inStock,
    todaySales,
    todayRevenue: todayRevenueAgg[0]?.total ?? 0,
    debtTotal: debtAgg[0]?.total ?? 0,
  });
}
