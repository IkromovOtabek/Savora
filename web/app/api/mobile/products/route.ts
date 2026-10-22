import { NextResponse } from 'next/server';
import { getStockQty } from '@/lib/productQuantity';
import { randomBytes } from 'crypto';
import { authenticateMobile } from '@/lib/mobileAuth';
import { mobilePermissionDenied, userCan } from '@/lib/permissionGuard';
import { recordAudit } from '@/lib/audit';
import { getTenantModels } from '@/lib/tenantDb';
import { branchFilter } from '@/lib/branchScope';
import { parseIntegerSum, searchPattern } from '@/lib/security';
import { getMasterModels } from '@/lib/masterDb';
import { termsFor } from '@/lib/businessTypes';
import { isProductUnit, parseProductFields, productFieldErrorText } from '@/lib/productFields';
import { isTenantUploadUrl } from '@/lib/fileUrl';
import { Types } from 'mongoose';
import type { ProductUnit } from '@/lib/businessTypes';
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
      available: getStockQty(p),
      unit: p.unit ?? null,
    })),
  });
}

/** Variativ tovar: bitta so'rovda turlar soni chegarasi */
const MAX_VARIANTS = 50;

interface VariantInput { name: string; code: string; barcode: string; salePrice: number; purchasePrice: number }

/**
 * Yangi mahsulot qo'shish (mobil). Filial-login o'z filialiga, admin asosiy omborga.
 * `variants` berilsa — har tur alohida tovar bo'lib yaratiladi (umumiy variantGroupId bilan).
 */
export async function POST(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName) {
    return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  }
  { const denied = await mobilePermissionDenied(user, 'product.create'); if (denied) return denied; }
  let body: {
    name?: string; code?: string; barcode?: string; brand?: string; purchasePrice?: number; salePrice?: number; notes?: string;
    oldPrice?: number; photoUrl?: string; categoryId?: string; supplierId?: string; unit?: string; variants?: unknown;
  } & Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Noto\'g\'ri so\'rov.' }, { status: 400 }); }

  const name = String(body.name || '').trim();
  // Butun so'm — kasr/manfiy narx rad etiladi
  const salePrice = parseIntegerSum(body.salePrice ?? 0) ?? 0;
  const purchasePriceParsed = parseIntegerSum(body.purchasePrice ?? 0);
  if (purchasePriceParsed === null) return NextResponse.json({ error: 'Kelish narxi noto\'g\'ri.' }, { status: 400 });
  const purchasePrice = purchasePriceParsed;
  const oldPriceParsed = body.oldPrice ? parseIntegerSum(body.oldPrice) : 0;
  if (oldPriceParsed === null) return NextResponse.json({ error: 'Eski narx noto\'g\'ri.' }, { status: 400 });
  const oldPrice = oldPriceParsed;
  const code = String(body.code || '').trim().toUpperCase().replace(/\s/g, '');
  const barcode = String(body.barcode || '').trim();
  const brand = String(body.brand || '').trim();
  const notes = String(body.notes || '').trim();
  const photoUrl = String(body.photoUrl || '').trim();
  if (!name) return NextResponse.json({ error: 'Nom kiritilishi shart.' }, { status: 400 });
  if (tooLong(name, MAX_LEN.name) || tooLong(code, MAX_LEN.code) || tooLong(barcode, MAX_LEN.barcode)
    || tooLong(brand, MAX_LEN.brand) || tooLong(notes, MAX_LEN.notes)) {
    return NextResponse.json({ error: 'Matn maydoni juda uzun.' }, { status: 400 });
  }
  // Rasm — faqat shu do'kon papkasiga yuklangan fayl (tashqi/boshqa do'kon havolasi rad)
  if (photoUrl && !isTenantUploadUrl(photoUrl, user.dbName)) {
    return NextResponse.json({ error: 'Rasm manzili noto\'g\'ri.' }, { status: 400 });
  }
  if (body.unit && !isProductUnit(body.unit)) return NextResponse.json({ error: 'O\'lchov birligi noto\'g\'ri.' }, { status: 400 });

  // Turlar (variantlar) — har biri: nom, kod, shtrix, narx (berilmasa asosiy narx)
  const variants: VariantInput[] = [];
  if (Array.isArray(body.variants) && body.variants.length) {
    if (body.variants.length > MAX_VARIANTS) return NextResponse.json({ error: `Turlar soni ${MAX_VARIANTS} tadan oshmasin.` }, { status: 400 });
    for (const raw of body.variants as Record<string, unknown>[]) {
      const vName = String(raw?.name ?? '').trim();
      const vCode = String(raw?.code ?? '').trim().toUpperCase().replace(/\s/g, '');
      const vBarcode = String(raw?.barcode ?? '').trim();
      const vSale = raw?.salePrice ? parseIntegerSum(raw.salePrice) : salePrice;
      const vBuy = raw?.purchasePrice ? parseIntegerSum(raw.purchasePrice) : purchasePrice;
      if (!vName) return NextResponse.json({ error: 'Har bir tur nomini kiriting.' }, { status: 400 });
      if (tooLong(vName, 60) || tooLong(vCode, MAX_LEN.code) || tooLong(vBarcode, MAX_LEN.barcode)) {
        return NextResponse.json({ error: 'Matn maydoni juda uzun.' }, { status: 400 });
      }
      if (vSale === null || vSale <= 0 || vBuy === null) return NextResponse.json({ error: `«${vName}» narxi noto'g'ri.` }, { status: 400 });
      variants.push({ name: vName, code: vCode, barcode: vBarcode, salePrice: vSale, purchasePrice: vBuy });
    }
  } else if (salePrice <= 0) {
    return NextResponse.json({ error: 'Sotuv narxi noto\'g\'ri.' }, { status: 400 });
  }

  // Yo'nalish: telefon do'konda IMEI majburiy, qolgan maydonlar PRODUCT_FIELDS bo'yicha
  const { Organization } = await getMasterModels();
  const org = await Organization.findById(user.organizationId, { businessType: 1 }).lean();
  const businessType = org?.businessType;
  // Xato matnlari mobil API'dagi boshqalar kabi o'zbekcha
  const stockDict = getDictionary('uz').stock;
  const hasImei = termsFor(businessType).hasImei;
  if (hasImei && (variants.length ? variants.some((v) => v.code.length < 10) : code.length < 10)) {
    return NextResponse.json({ error: stockDict.msg.imeiMin }, { status: 400 });
  }
  const extra = parseProductFields(businessType, (key) => body[key]);
  if (!extra.ok) {
    return NextResponse.json({ error: productFieldErrorText(extra, stockDict.fields.labels, stockDict.msg) }, { status: 400 });
  }

  const { Product, Branch, ProductCategory, Supplier } = await getTenantModels(user.dbName);

  // Turkum va yetkazib beruvchi — shu do'kon bazasida mavjud bo'lishi shart
  let category: { categoryId: Types.ObjectId; category: string } | null = null;
  if (body.categoryId) {
    const cat = Types.ObjectId.isValid(String(body.categoryId))
      ? await ProductCategory.findById(String(body.categoryId), { name: 1 }).lean() : null;
    if (!cat) return NextResponse.json({ error: 'Turkum topilmadi.' }, { status: 400 });
    category = { categoryId: cat._id, category: cat.name };
  }
  let supplierId: Types.ObjectId | undefined;
  if (body.supplierId) {
    const sup = Types.ObjectId.isValid(String(body.supplierId))
      ? await Supplier.findById(String(body.supplierId), { _id: 1 }).lean() : null;
    if (!sup) return NextResponse.json({ error: 'Yetkazib beruvchi topilmadi.' }, { status: 400 });
    supplierId = sup._id;
  }

  let branchId = user.branchId;
  if (!branchId) {
    const main = (await Branch.findOne({ isMain: true }).lean()) ?? (await Branch.findOne({}).lean());
    if (!main) return NextResponse.json({ error: 'Avval filial oching.' }, { status: 400 });
    branchId = String(main._id);
  }

  // Kod/IMEI berilmasa avtomatik yaratamiz — vaqt + tasodifiy qism (bir ms ichida ikki so'rov to'qnashmasin)
  const autoCode = () => `SVR-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;
  const rows = variants.length
    ? variants.map((v) => ({ name: `${name} ${v.name}`, variantName: v.name, imei: v.code || autoCode(), barcode: v.barcode, salePrice: v.salePrice, purchasePrice: v.purchasePrice }))
    : [{ name, variantName: undefined, imei: code || autoCode(), barcode, salePrice, purchasePrice }];
  const codes = rows.map((r) => r.imei);
  if (new Set(codes).size !== codes.length) return NextResponse.json({ error: 'Turlarning kodlari takrorlanmasin.' }, { status: 400 });
  const dup = await Product.findOne({ imei: { $in: codes } }, { imei: 1 }).lean();
  if (dup) return NextResponse.json({ error: `Bu kod/IMEI allaqachon mavjud: ${dup.imei}` }, { status: 409 });

  const variantGroupId = variants.length ? randomBytes(8).toString('hex') : undefined;
  const common = {
    brand: brand || undefined,
    oldPrice: oldPrice || undefined,
    photoUrl: photoUrl || undefined,
    branchId, status: 'in_stock' as const,
    notes: notes || undefined,
    ...extra.values,
    ...(body.unit ? { unit: body.unit as ProductUnit } : {}),
    ...(category ?? {}),
    supplierId,
    variantGroupId,
    createdBy: user.username,
    history: [{ action: 'created' as const, detail: 'Mobil ilova orqali qo\'shildi', by: user.username, at: new Date() }],
  };

  let created;
  try {
    created = await Product.insertMany(rows.map((r) => ({
      ...common,
      name: r.name,
      variantName: r.variantName,
      imei: r.imei,
      barcode: r.barcode || undefined,
      salePrice: r.salePrice,
      purchasePrice: r.purchasePrice,
    })), { ordered: true });
  } catch (err) {
    // Unique indeks (E11000) — findOne va insert orasidagi poyga; 500 emas, 409.
    // ordered: true — xatodan oldingi turlar yozilgan bo'lishi mumkin, ularni qaytaramiz
    if ((err as { code?: number })?.code === 11000) {
      if (variantGroupId) await Product.deleteMany({ variantGroupId });
      return NextResponse.json({ error: 'Bu kod/IMEI allaqachon mavjud.' }, { status: 409 });
    }
    throw err;
  }

  for (const p of created) {
    await recordAudit(user, {
      action: 'product.create',
      entity: 'product',
      entityId: String(p._id),
      summary: `Mahsulot qo'shildi: ${p.name} (mobil)`,
    });
  }

  const first = created[0];
  return NextResponse.json({ id: String(first._id), name: first.name, count: created.length }, { status: 201 });
}
