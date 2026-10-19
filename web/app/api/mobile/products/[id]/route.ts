import { NextResponse } from 'next/server';
import { getStockQty } from '@/lib/productQuantity';
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
  const available = getStockQty(p);

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
    trackQuantity: p.trackQuantity ?? false,
    quantity: p.quantity ?? 1,
    soldQuantity: p.soldQuantity ?? 0,
    available,
    unit: p.unit ?? null,
    branch: branch?.name ?? null,
    notes: p.notes ?? null,
    createdAt: p.createdAt,
    history: (p.history ?? []).slice(-10).reverse().map((h) => ({
      action: h.action, detail: h.detail ?? null, by: h.by ?? null, at: h.at,
    })),
  });
}
