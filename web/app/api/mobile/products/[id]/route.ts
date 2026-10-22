import { NextResponse } from 'next/server';
import { sellableInfo } from '@/lib/productKinds';
import { Types } from 'mongoose';
import { authenticateMobile } from '@/lib/mobileAuth';
import { userCan } from '@/lib/permissionGuard';
import { getTenantModels } from '@/lib/tenantDb';
import { branchFilter } from '@/lib/branchScope';

/** Bitta mahsulot — batafsil (tarix bilan). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName) {
    return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  }
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Mahsulot topilmadi.' }, { status: 404 });
  }

  const { Product, Branch } = await getTenantModels(user.dbName);
  const canViewCost = await userCan(user, 'product.viewCost');
  const p = await Product.findOne({ _id: id, ...branchFilter(user) }).lean();
  if (!p) return NextResponse.json({ error: 'Mahsulot topilmadi.' }, { status: 404 });

  const branch = p.branchId ? await Branch.findById(p.branchId).lean() : null;
  const sell = (await sellableInfo(Product, [p]))(p);
  // To'plam tarkibi (nomlari bilan)
  const bundle = p.kind === 'bundle' && p.bundleItems?.length
    ? await Product.find({ _id: { $in: p.bundleItems.map((i) => i.productId) } }, { name: 1, unit: 1 }).setOptions({ withDeleted: true }).lean()
    : [];
  const bundleName = new Map(bundle.map((b) => [String(b._id), b]));

  return NextResponse.json({
    id: String(p._id),
    name: p.name,
    brand: p.brand ?? null,
    deviceModel: p.deviceModel ?? null,
    imei: p.imei,
    barcode: p.barcode ?? null,
    color: p.color ?? null,
    purchasePrice: canViewCost ? p.purchasePrice : 0,
    salePrice: p.salePrice,
    profit: canViewCost ? Math.max(0, (p.salePrice ?? 0) - (p.purchasePrice ?? 0)) : 0,
    costHidden: !canViewCost,
    status: p.status,
    kind: p.kind ?? 'goods',
    bundleItems: (p.bundleItems ?? []).map((i) => ({
      productId: String(i.productId),
      name: bundleName.get(String(i.productId))?.name ?? '—',
      qty: i.qty,
      unit: bundleName.get(String(i.productId))?.unit ?? null,
    })),
    trackQuantity: sell.tracked,
    quantity: p.quantity ?? 1,
    soldQuantity: p.soldQuantity ?? 0,
    available: sell.available,
    unit: p.unit ?? null,
    branch: branch?.name ?? null,
    notes: p.notes ?? null,
    createdAt: p.createdAt,
    history: (p.history ?? []).slice(-10).reverse().map((h) => ({
      action: h.action, detail: h.detail ?? null, by: h.by ?? null, at: h.at,
    })),
  });
}
