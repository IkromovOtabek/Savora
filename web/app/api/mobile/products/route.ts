import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { authenticateMobile } from '@/lib/mobileAuth';
import { mobilePermissionDenied, userCan } from '@/lib/permissionGuard';
import { recordAudit } from '@/lib/audit';
import { getTenantModels } from '@/lib/tenantDb';
import { branchFilter } from '@/lib/branchScope';
import { parseIntegerSum, searchPattern } from '@/lib/security';
import { getMasterModels } from '@/lib/masterDb';
import { termsFor } from '@/lib/businessTypes';
import { parseProductFields, productFieldErrorText } from '@/lib/productFields';
import { getDictionary } from '@/lib/i18n/dict';

/** Matn maydonlari uzunlik chegarasi — oshsa 400 (xotira/DB to'ldirish himoyasi) */
const MAX_LEN = { name: 120, code: 64, barcode: 64, brand: 60, notes: 500 } as const;
const tooLong = (v: string, max: number) => v.length > max;

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
  // Sahifa 1..1000 — cheksiz skip() bilan DB'ni qiynamaslik uchun
  const page = Math.min(1000, Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1));
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
  let body: { name?: string; code?: string; barcode?: string; brand?: string; purchasePrice?: number; salePrice?: number; notes?: string } & Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Noto\'g\'ri so\'rov.' }, { status: 400 }); }

  const name = String(body.name || '').trim();
  // Butun so'm — kasr/manfiy narx rad etiladi
  const salePrice = parseIntegerSum(body.salePrice ?? 0) ?? 0;
  const purchasePriceParsed = parseIntegerSum(body.purchasePrice ?? 0);
  if (purchasePriceParsed === null) return NextResponse.json({ error: 'Kelish narxi noto\'g\'ri.' }, { status: 400 });
  const purchasePrice = purchasePriceParsed;
  const code = String(body.code || '').trim().toUpperCase().replace(/\s/g, '');
  const barcode = String(body.barcode || '').trim();
  const brand = String(body.brand || '').trim();
  const notes = String(body.notes || '').trim();
  if (!name) return NextResponse.json({ error: 'Nom kiritilishi shart.' }, { status: 400 });
  if (tooLong(name, MAX_LEN.name) || tooLong(code, MAX_LEN.code) || tooLong(barcode, MAX_LEN.barcode)
    || tooLong(brand, MAX_LEN.brand) || tooLong(notes, MAX_LEN.notes)) {
    return NextResponse.json({ error: 'Matn maydoni juda uzun.' }, { status: 400 });
  }
  if (salePrice <= 0) return NextResponse.json({ error: 'Sotuv narxi noto\'g\'ri.' }, { status: 400 });

  // Yo'nalish: telefon do'konda IMEI majburiy, qolgan maydonlar PRODUCT_FIELDS bo'yicha
  const { Organization } = await getMasterModels();
  const org = await Organization.findById(user.organizationId, { businessType: 1 }).lean();
  const businessType = org?.businessType;
  // Xato matnlari mobil API'dagi boshqalar kabi o'zbekcha
  const stockDict = getDictionary('uz').stock;
  if (termsFor(businessType).hasImei && code.length < 10) {
    return NextResponse.json({ error: stockDict.msg.imeiMin }, { status: 400 });
  }
  const extra = parseProductFields(businessType, (key) => body[key]);
  if (!extra.ok) {
    return NextResponse.json({ error: productFieldErrorText(extra, stockDict.fields.labels, stockDict.msg) }, { status: 400 });
  }

  const { Product, Branch } = await getTenantModels(user.dbName);

  let branchId = user.branchId;
  if (!branchId) {
    const main = (await Branch.findOne({ isMain: true }).lean()) ?? (await Branch.findOne({}).lean());
    if (!main) return NextResponse.json({ error: 'Avval filial oching.' }, { status: 400 });
    branchId = String(main._id);
  }

  // Kod/IMEI berilmasa avtomatik yaratamiz — vaqt + tasodifiy qism (bir ms ichida ikki so'rov to'qnashmasin)
  const imei = code || `SVR-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;
  const dup = await Product.findOne({ imei }).lean();
  if (dup) return NextResponse.json({ error: 'Bu kod/IMEI allaqachon mavjud.' }, { status: 409 });

  let p;
  try {
    p = await Product.create({
      name, imei, barcode: barcode || undefined,
      brand: brand || undefined,
      purchasePrice, salePrice, branchId, status: 'in_stock',
      notes: notes || undefined,
      ...extra.values,
      createdBy: user.username,
      history: [{ action: 'created', detail: 'Mobil ilova orqali qo\'shildi', by: user.username, at: new Date() }],
    });
  } catch (err) {
    // Unique indeks (E11000) — findOne va create orasidagi poyga; 500 emas, 409
    if ((err as { code?: number })?.code === 11000) {
      return NextResponse.json({ error: 'Bu kod/IMEI allaqachon mavjud.' }, { status: 409 });
    }
    throw err;
  }

  await recordAudit(user, {
    action: 'product.create',
    entity: 'product',
    entityId: String(p._id),
    summary: `Mahsulot qo'shildi: ${name} (mobil)`,
  });

  return NextResponse.json({ id: String(p._id), name: p.name }, { status: 201 });
}
