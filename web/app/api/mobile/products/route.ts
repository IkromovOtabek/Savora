import { NextResponse } from 'next/server';
import { verifyMobileToken } from '@/lib/mobileAuth';
import { getTenantModels } from '@/lib/tenantDb';
import { branchFilter } from '@/lib/branchScope';

export async function GET(req: Request) {
  const user = await verifyMobileToken(req);
  if (!user || !user.dbName) {
    return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  }
  const { Product } = await getTenantModels(user.dbName);

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const limit = 30;

  const filter: Record<string, unknown> = { ...branchFilter(user) };
  if (q) {
    const qn = q.replace(/\s/g, '');
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { imei: { $regex: qn, $options: 'i' } },
      { barcode: { $regex: qn, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);

  return NextResponse.json({
    page,
    total,
    hasMore: page * limit < total,
    items: items.map((p) => ({
      id: String(p._id),
      name: p.name,
      imei: p.imei,
      barcode: p.barcode ?? null,
      salePrice: p.salePrice,
      purchasePrice: p.purchasePrice,
      status: p.status,
      trackQuantity: p.trackQuantity ?? false,
      available: p.trackQuantity ? Math.max(0, (p.quantity ?? 0) - (p.soldQuantity ?? 0)) : (p.status === 'in_stock' ? 1 : 0),
    })),
  });
}
