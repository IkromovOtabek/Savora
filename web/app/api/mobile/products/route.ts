import { NextResponse } from 'next/server';
import { authenticateMobile } from '@/lib/mobileAuth';
import { mobilePermissionDenied, userCan } from '@/lib/permissionGuard';
import { getTenantModels } from '@/lib/tenantDb';
import { branchFilter } from '@/lib/branchScope';
import { parseIntegerSum, searchPattern } from '@/lib/security';

export async function GET(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName) {
    return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  }
  const { Product } = await getTenantModels(user.dbName);
  const canViewCost = await userCan(user, 'product.viewCost');

  const url = new URL(req.url);
  // Regex injection/ReDoS himoyasi: ekranlangan, 50 belgigacha
  const q = searchPattern(url.searchParams.get('q'));
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const limit = 30;

  // Ombor faqat qoldiq — sotilganlar bu yerda emas ("Sotildi" da)
  const filter: Record<string, unknown> = { ...branchFilter(user), status: { $ne: 'sold' } };
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
      purchasePrice: canViewCost ? p.purchasePrice : 0,
      costHidden: !canViewCost,
      status: p.status,
      trackQuantity: p.trackQuantity ?? false,
      available: p.trackQuantity ? Math.max(0, (p.quantity ?? 0) - (p.soldQuantity ?? 0)) : (p.status === 'in_stock' ? 1 : 0),
    })),
  });
}

/** Yangi mahsulot qo'shish (mobil). Filial-login o'z filialiga, admin asosiy omborga. */
export async function POST(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName) {
    return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  }
  { const denied = await mobilePermissionDenied(user, 'product.create'); if (denied) return denied; }
  let body: { name?: string; code?: string; barcode?: string; brand?: string; purchasePrice?: number; salePrice?: number; notes?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Noto\'g\'ri so\'rov.' }, { status: 400 }); }

  const name = String(body.name || '').trim();
  // Butun so'm — kasr/manfiy narx rad etiladi
  const salePrice = parseIntegerSum(body.salePrice ?? 0) ?? 0;
  const purchasePriceParsed = parseIntegerSum(body.purchasePrice ?? 0);
  if (purchasePriceParsed === null) return NextResponse.json({ error: 'Kelish narxi noto\'g\'ri.' }, { status: 400 });
  const purchasePrice = purchasePriceParsed;
  const code = String(body.code || '').trim().toUpperCase().replace(/\s/g, '');
  const barcode = String(body.barcode || '').trim();
  if (!name) return NextResponse.json({ error: 'Nom kiritilishi shart.' }, { status: 400 });
  if (salePrice <= 0) return NextResponse.json({ error: 'Sotuv narxi noto\'g\'ri.' }, { status: 400 });

  const { Product, Branch } = await getTenantModels(user.dbName);

  let branchId = user.branchId;
  if (!branchId) {
    const main = (await Branch.findOne({ isMain: true }).lean()) ?? (await Branch.findOne({}).lean());
    if (!main) return NextResponse.json({ error: 'Avval filial oching.' }, { status: 400 });
    branchId = String(main._id);
  }

  // Kod/IMEI berilmasa avtomatik yaratamiz (unique bo'lishi shart)
  const imei = code || `SVR-${Date.now().toString(36).toUpperCase()}`;
  const dup = await Product.findOne({ imei }).lean();
  if (dup) return NextResponse.json({ error: 'Bu kod/IMEI allaqachon mavjud.' }, { status: 409 });

  const p = await Product.create({
    name, imei, barcode: barcode || undefined,
    brand: String(body.brand || '').trim() || undefined,
    purchasePrice, salePrice, branchId, status: 'in_stock',
    notes: String(body.notes || '').trim() || undefined,
    createdBy: user.username,
    history: [{ action: 'created', detail: 'Mobil ilova orqali qo\'shildi', by: user.username, at: new Date() }],
  });

  return NextResponse.json({ id: String(p._id), name: p.name }, { status: 201 });
}
