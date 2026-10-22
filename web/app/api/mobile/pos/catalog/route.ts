import { NextResponse } from 'next/server';
import { authenticateMobile } from '@/lib/mobileAuth';
import { mobilePermissionDenied } from '@/lib/permissionGuard';
import { getTenantModels } from '@/lib/tenantDb';
import { branchFilter } from '@/lib/branchScope';
import { getMobileFeatures } from '@/lib/mobileOrg';
import { sellableInfo } from '@/lib/productKinds';

/** Oflayn katalogda eng ko'p mahsulot (telefon xotirasi va trafik chegarasi) */
const CATALOG_LIMIT = 5000;

/**
 * Oflayn POS katalogi — sotuvga tayyor (in_stock) mahsulotlar, ixcham shaklda.
 * Mobil ilova buni qurilmada saqlaydi: internet yo'qolsa shu ro'yxatdan sotadi.
 * Kelish narxi yuborilmaydi (oflayn sotuvga kerak emas).
 */
export async function GET(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  { const denied = await mobilePermissionDenied(user, 'sale.create'); if (denied) return denied; }
  const features = await getMobileFeatures(user.organizationId);
  if (!features?.sales) return NextResponse.json({ error: 'Sotuv moduli yoqilmagan.' }, { status: 403 });

  const { Product } = await getTenantModels(user.dbName);
  const filter = { ...branchFilter(user), status: 'in_stock' };
  const [items, total] = await Promise.all([
    Product.find(filter, { name: 1, imei: 1, barcode: 1, salePrice: 1, trackQuantity: 1, quantity: 1, soldQuantity: 1, status: 1, unit: 1, kind: 1, bundleItems: 1 })
      .sort({ name: 1 })
      .limit(CATALOG_LIMIT)
      .lean(),
    Product.countDocuments(filter),
  ]);
  const sellOf = await sellableInfo(Product, items);

  return NextResponse.json({
    serverTime: new Date().toISOString(),
    total,
    truncated: total > items.length,
    items: items.map((p) => ({
      id: String(p._id),
      name: p.name,
      imei: p.imei,
      barcode: p.barcode ?? null,
      salePrice: p.salePrice,
      kind: p.kind ?? 'goods',
      trackQuantity: sellOf(p).tracked,
      available: sellOf(p).available,
      unit: p.unit ?? null,
    })),
  });
}
