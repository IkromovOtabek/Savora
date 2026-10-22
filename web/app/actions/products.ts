'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Types } from 'mongoose';
import { getTenantSession } from '@/lib/tenantSession';
import { branchFilter, isBranchScoped } from '@/lib/branchScope';
import { reserveStock, releaseStock } from '@/lib/stock';
import { isPhoneShop } from '@/lib/businessTypes';
import { ProductStatus } from '@/lib/models/tenant/Product';
import { generateProductCode } from '@/lib/productId';
import { clampQtyToStock, parseQtyField } from '@/lib/productQuantity';
import { isFractionalUnit, parseQty, priceTimesQty, qtyLabel, roundQty } from '@/lib/qty';
import { parseProductFields, productFieldErrorText, type ProductFieldsResult } from '@/lib/productFields';
import { resolveWarehouseBranchId } from '@/lib/warehouseBranch';
import { recordAudit } from '@/lib/audit';
import { markOnboardingStep } from '@/lib/onboarding';
import { ensureMainBranchId } from '@/lib/mainBranch';
import { checkPermission, userCan } from '@/lib/permissionGuard';
import { permissionDeniedError } from '@/lib/permissions';
import { featureDisabledError } from '@/lib/featureAction';
import { isOwnUploadUrl } from '@/lib/fileUrl';
import { getDict, type Dict } from '@/lib/i18n/server';
import { qtyWithUnit, tr } from '@/lib/i18n/fmt';
import { logError } from '@/lib/logger';
import { softDeleteOne } from '@/lib/softDelete';
import { categoryLevelInDb, findOrCreateBrand, findOrCreateCategory } from '@/lib/catalogStore';
import { lookupBarcode, type BarcodeLookupResult } from '@/lib/barcodeLookup';
import { CATEGORY_MAX_DEPTH, CATEGORY_NAME_MAX } from '@/lib/models/tenant/ProductCategory';
import { BRAND_NAME_MAX } from '@/lib/models/tenant/Brand';
import { LEGACY_CATEGORY_VALUE, normalizeCatalogName } from '@/lib/productCatalog';

type State = { error?: string; success?: string } | null;
// Mahsulot holati formada: omborda (o'z filialida) yoki sotilgan.
// Boshqa filialga o'tkazish — alohida "Filialga berish" (transfer) orqali.
type LocationStatus = 'warehouse' | 'sold';
type Msg = Dict['stock']['msg'];

/**
 * Formadagi yetkazib beruvchi tanlovi:
 *  - maydon umuman yo'q (huquqsiz — forma ko'rsatmaydi) → 'keep' (o'zgartirilmaydi)
 *  - '' → null (bog'lanish olib tashlanadi)
 *  - mavjud id → ObjectId; noma'lum id → 'invalid'
 */
async function readSupplierChoice(
  formData: FormData,
  user: Parameters<typeof userCan>[0],
  Supplier: Awaited<ReturnType<typeof getTenantSession>>['Supplier'],
): Promise<Types.ObjectId | null | 'keep' | 'invalid'> {
  if (!formData.has('supplierId')) return 'keep';
  if (!(await userCan(user, 'suppliers.manage'))) return 'keep';
  const raw = String(formData.get('supplierId') || '');
  if (!raw) return null;
  if (!Types.ObjectId.isValid(raw)) return 'invalid';
  const exists = await Supplier.exists({ _id: raw });
  return exists ? new Types.ObjectId(raw) : 'invalid';
}

type TenantModels = Awaited<ReturnType<typeof getTenantSession>>;

/**
 * Formadagi turkum (ProductCategory) tanlovi — mobil API bilan bir xil: categoryId + category (nomi):
 *  - maydon yo'q → 'keep' (eski forma: kategoriya matni yo'nalish maydonlari orqali)
 *  - LEGACY_CATEGORY_VALUE → 'legacy' (turkumga bog'lanmagan eski matn o'zgarmaydi)
 *  - '' → null (turkum olib tashlanadi)
 *  - mavjud id → { categoryId, category }; noma'lum id → 'invalid'
 */
async function readCategoryChoice(
  formData: FormData,
  ProductCategory: TenantModels['ProductCategory'],
): Promise<{ categoryId: Types.ObjectId; category: string } | null | 'keep' | 'legacy' | 'invalid'> {
  if (!formData.has('categoryId')) return 'keep';
  const raw = String(formData.get('categoryId') || '');
  if (raw === LEGACY_CATEGORY_VALUE) return 'legacy';
  if (!raw) return null;
  if (!Types.ObjectId.isValid(raw)) return 'invalid';
  const cat = await ProductCategory.findById(raw, { name: 1 }).lean();
  return cat ? { categoryId: cat._id, category: cat.name } : 'invalid';
}

/** Brend — nomi saqlanadi (ro'yxat Brand modelida). Maydon yo'q → 'keep', juda uzun → 'tooLong' */
function readBrand(formData: FormData): string | undefined | 'keep' | 'tooLong' {
  if (!formData.has('brand')) return 'keep';
  const brand = normalizeCatalogName(formData.get('brand'));
  if (brand.length > BRAND_NAME_MAX) return 'tooLong';
  return brand || undefined;
}

/** Eski narx: yoqish tugmasi o'chiq bo'lsa 0 (olib tashlanadi), noto'g'ri bo'lsa null */
function readOldPrice(formData: FormData): number | null {
  if (formData.get('oldPriceOn') !== 'on') return 0;
  return parseOptionalPrice(String(formData.get('oldPrice') || ''));
}

/** Narx — faqat butun so'm (kasr/manfiy → null) */
function parsePrice(v: string): number | null {
  const n = Number(v.replace(/\s/g, ''));
  if (!Number.isSafeInteger(n) || n < 0) return null;
  return n;
}

/** Ixtiyoriy narx: bo'sh bo'lsa 0, noto'g'ri (yoki kasr) bo'lsa null */
function parseOptionalPrice(v: string): number | null {
  const t = v.replace(/\s/g, '').trim();
  if (!t) return 0;
  const n = Number(t);
  if (!Number.isSafeInteger(n) || n < 0) return null;
  return n;
}

/** Yo'nalishga xos maydonlar (kategoriya, kafolat, yaroqlilik ...) — xato bo'lsa tayyor matn */
async function readProductFields(
  formData: FormData,
  businessType: string | undefined,
): Promise<Extract<ProductFieldsResult, { ok: true }> | { ok: false; error: string }> {
  const res = parseProductFields(businessType, (key) => formData.get(key));
  if (res.ok) return res;
  const d = (await getDict()).stock;
  return { ok: false, error: productFieldErrorText(res, d.fields.labels, d.msg) };
}

function normalizeImei(v: string): string {
  return v.trim().replace(/\s/g, '').toUpperCase();
}

function fmtSum(n: number): string {
  return new Intl.NumberFormat('uz-UZ').format(n) + ' so\'m';
}

function parseLocationStatus(v: string): LocationStatus {
  if (v === 'sold') return 'sold';
  return 'warehouse';
}

/** Rasm URL tekshiruvi: faqat o'zimizning storage + «Rasm/kamera» moduli yoqilgan bo'lsa */
async function photoUrlError(photoUrl: string, mediaUpload: boolean, m: Msg): Promise<State> {
  if (!photoUrl) return null;
  if (!mediaUpload) return featureDisabledError('mediaUpload');
  if (!isOwnUploadUrl(photoUrl)) return { error: m.photoUrlInvalid };
  return null;
}

function applyLocationStatus(
  product: {
    status: ProductStatus;
    branchId: Types.ObjectId;
    trackQuantity: boolean;
    quantity: number;
    soldQuantity: number;
    soldPaymentType?: 'cash' | 'credit';
    soldBankName?: string;
  },
  locationStatus: LocationStatus,
  soldPaymentType: 'cash' | 'credit',
  soldBankName: string,
  creditKassaEnabled: boolean,
  m: Msg
): State {
  if (locationStatus === 'sold') {
    // Tahrir formasi orqali sotish YO'Q — sotuv (Sale yozuvi, kassa, huquqlar) faqat Sotuv oynasida.
    // Allaqachon sotilgan mahsulotda faqat to'lov turi yangilanadi.
    if (product.status !== 'sold') {
      return { error: m.sellOnlyViaSales };
    }
    if (creditKassaEnabled && soldPaymentType === 'credit') {
      if (!soldBankName) return { error: m.bankRequired };
      product.soldPaymentType = 'credit';
      product.soldBankName = soldBankName;
    } else {
      product.soldPaymentType = 'cash';
      product.soldBankName = undefined;
    }
    return null;
  }

  // 'warehouse' = o'z filialida, omborda (in_stock). branchId o'zgarmaydi —
  // boshqa filialga o'tkazish "Filialga berish" (transfer) orqali.
  product.soldPaymentType = undefined;
  product.soldBankName = undefined;
  // Faqat SOTILGAN holatdan omborga QAYTARILGANDA sotilgan sonni nollash.
  // Oddiy tahrirda (allaqachon omborda) soldQuantity saqlanadi — aks holda
  // qisman sotilgan mahsulot tahrir qilinsa, sotuv tarixi yo'qolardi.
  if (product.status === 'sold') {
    product.soldQuantity = 0;
  }
  product.status = 'in_stock';
  return null;
}

function generateSku(): string {
  return `SKU-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function createProductAction(_prev: State, formData: FormData): Promise<State> {
  const { user, org, Product, Branch, features, Supplier, SupplierEntry, ProductCategory } = await getTenantSession();
  { const denied = await checkPermission(user, 'product.create'); if (denied) return denied; }
  const m = (await getDict()).stock.msg;
  const phoneShop = isPhoneShop(org);

  const name = String(formData.get('name') || '').trim();
  let imei = normalizeImei(String(formData.get('imei') || ''));
  const barcode = String(formData.get('barcode') || '').trim();
  const color = String(formData.get('color') || '').trim();
  const notes = String(formData.get('notes') || '').trim();
  const photoUrl = String(formData.get('photoUrl') || '').trim();
  const purchasePrice = parsePrice(String(formData.get('purchasePrice') || ''));
  const salePrice = parseOptionalPrice(String(formData.get('salePrice') || ''));
  const wholesalePrice = parseOptionalPrice(String(formData.get('wholesalePrice') || ''));
  const trackQuantity = formData.get('trackQuantity') === 'on';
  const quantityRaw = String(formData.get('quantity') || '1');

  if (!name) return { error: m.nameRequired };
  if (phoneShop) {
    if (!imei || imei.length < 10) return { error: m.imeiMin };
  } else {
    if (barcode) imei = normalizeImei(barcode);
    else imei = generateSku();
  }
  if (purchasePrice === null) return { error: m.purchaseInvalid };
  if (salePrice === null) return { error: m.saleInvalid };
  if (wholesalePrice === null) return { error: m.wholesaleInvalid };
  const oldPrice = readOldPrice(formData);
  if (oldPrice === null) return { error: m.oldPriceInvalid };
  const brand = readBrand(formData);
  if (brand === 'tooLong') return { error: m.brandNameTooLong };
  const extra = await readProductFields(formData, org.businessType);
  if (!extra.ok) return { error: extra.error };
  const categoryChoice = await readCategoryChoice(formData, ProductCategory);
  if (categoryChoice === 'invalid') return { error: m.categoryNotFound };
  // Kasrli birlikda (kg, m…) miqdor ≤3 xona kasr, aks holda butun
  const quantity = trackQuantity ? parseQtyField(quantityRaw, 1, extra.values.unit) : 1;
  { const photoErr = await photoUrlError(photoUrl, features.mediaUpload, m); if (photoErr) return photoErr; }
  const supplierChoice = await readSupplierChoice(formData, user, Supplier);
  if (supplierChoice === 'invalid') return { error: (await getDict()).stock.suppliers.msg.badSupplier };
  const supplierId = supplierChoice instanceof Types.ObjectId ? supplierChoice : undefined;
  const supplierDebt = !!supplierId && formData.get('supplierDebt') === 'on' && purchasePrice > 0;

  // Mahsulot joriy profilga qo'shiladi (tanlovsiz):
  //  - filial-login → o'z filiali
  //  - admin (biznes egasi) → o'zining "Asosiy ombori" (isMain), keyin "Filialga berish" orqali o'tkaziladi
  const targetBranchId =
    user.role === 'user' && user.branchId
      ? user.branchId
      : await ensureMainBranchId(Branch);
  const branch = await Branch.findOne({ _id: targetBranchId, active: true }).lean();
  if (!branch) return { error: m.warehouseNotFound };

  const dup = await Product.findOne({ imei }).lean();
  if (dup) return { error: m.imeiDup };

  try {
    const product = await Product.create({
      productId: generateProductCode(),
      name,
      imei,
      barcode: barcode || undefined,
      color: color || undefined,
      purchasePrice,
      salePrice,
      wholesalePrice: wholesalePrice || undefined,
      oldPrice: oldPrice || undefined,
      brand: brand === 'keep' ? undefined : brand,
      trackQuantity,
      quantity,
      soldQuantity: 0,
      status: 'in_stock',
      branchId: targetBranchId,
      notes: notes || undefined,
      photoUrl: photoUrl || undefined,
      ...extra.values,
      ...(categoryChoice && typeof categoryChoice === 'object' ? categoryChoice : {}),
      createdBy: user.username,
      supplierId,
      history: [{ action: 'created', detail: branch.name, by: user.username, at: new Date() }],
    });
    // Tovar qarzga olingan bo'lsa — yetkazib beruvchiga qarz yoziladi (kelish narxi × son)
    if (supplierDebt && supplierId) {
      try {
        await SupplierEntry.create({
          supplierId,
          type: 'purchase',
          amount: priceTimesQty(purchasePrice, quantity),
          note: quantity !== 1 ? `${name} × ${qtyLabel(quantity, extra.values.unit)}` : name,
          productId: product._id,
          at: new Date(),
          by: user.username,
        });
      } catch (err) {
        // Mahsulot saqlandi — qarz yozuvi tushmasa ham oqim buzilmaydi (qo'lda qo'shish mumkin)
        logError('supplier debt entry failed', err, { user: user.username, dbName: user.dbName });
      }
    }
    await recordAudit(user, {
      action: 'product.create',
      entity: 'product',
      entityId: String(product._id),
      summary: `Mahsulot qo'shildi: ${name}`,
    });
    await markOnboardingStep(user.organizationId, 'productAdded');
    revalidatePath('/app');
    revalidatePath('/app/products');
    redirect(`/app/products/${product._id}?created=1`);
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    return { error: m.createFailed };
  }
}

export async function updateProductAction(_prev: State, formData: FormData): Promise<State> {
  const { user, org, Product, Sale, CreditBank, features, Supplier, ProductCategory } = await getTenantSession();
  { const denied = await checkPermission(user, 'product.edit'); if (denied) return denied; }
  const m = (await getDict()).stock.msg;
  // Kelish narxini ko'rmaydigan xodim formada uni yubormaydi — mavjud qiymat saqlanadi
  const canViewCost = await userCan(user, 'product.viewCost');
  const phoneShop = isPhoneShop(org);

  const productId = String(formData.get('productId') || '');
  const name = String(formData.get('name') || '').trim();
  const imeiRaw = normalizeImei(String(formData.get('imei') || ''));
  const barcode = String(formData.get('barcode') || '').trim();
  const color = String(formData.get('color') || '').trim();
  const locationStatus = parseLocationStatus(String(formData.get('locationStatus') || 'warehouse'));
  const soldPaymentType = String(formData.get('soldPaymentType') || 'cash') === 'credit' ? 'credit' : 'cash';
  const soldBankName = String(formData.get('soldBankName') || '').trim();
  const notes = String(formData.get('notes') || '').trim();
  const photoUrl = String(formData.get('photoUrl') || '').trim();
  let purchasePrice = canViewCost ? parsePrice(String(formData.get('purchasePrice') || '')) : 0;
  const salePrice = parseOptionalPrice(String(formData.get('salePrice') || ''));
  const wholesalePrice = parseOptionalPrice(String(formData.get('wholesalePrice') || ''));
  const trackQuantity = formData.get('trackQuantity') === 'on';
  const quantityRaw = String(formData.get('quantity') || '1');

  if (!productId) return { error: m.notFound };
  if (!name) return { error: m.nameRequired };
  if (phoneShop && (!imeiRaw || imeiRaw.length < 10)) return { error: m.imeiInvalid };
  if (purchasePrice === null) return { error: m.purchaseInvalid };
  if (salePrice === null) return { error: m.saleInvalid };
  if (wholesalePrice === null) return { error: m.wholesaleInvalid };
  const oldPrice = readOldPrice(formData);
  if (oldPrice === null) return { error: m.oldPriceInvalid };
  const brand = readBrand(formData);
  if (brand === 'tooLong') return { error: m.brandNameTooLong };
  const extra = await readProductFields(formData, org.businessType);
  if (!extra.ok) return { error: extra.error };
  const categoryChoice = await readCategoryChoice(formData, ProductCategory);
  if (categoryChoice === 'invalid') return { error: m.categoryNotFound };
  { const photoErr = await photoUrlError(photoUrl, features.mediaUpload, m); if (photoErr) return photoErr; }

  if (!Types.ObjectId.isValid(productId)) return { error: m.notFound };
  // Filial login faqat o'z filiali mahsulotini tahrirlaydi (IDOR himoyasi)
  const product = await Product.findOne({ _id: productId, ...branchFilter(user) });
  if (!product) return { error: m.notFound };

  // Tahrir formasi orqali sotish — taqiqlangan (Sale yozuvi va kassa chetlab o'tilardi)
  if (locationStatus === 'sold' && product.status !== 'sold') {
    return { error: m.sellOnlyViaSales };
  }
  // Sotilganni omborga qaytarish = sotuvni bekor qilish bilan teng: "sale.cancel" huquqi kerak,
  // faol Sale yozuvi bo'lsa — avval o'sha sotuv bekor qilinadi (u o'zi mahsulotni qaytaradi)
  if (locationStatus === 'warehouse' && product.status === 'sold') {
    if (!(await userCan(user, 'sale.cancel'))) return permissionDeniedError('sale.cancel');
    const activeSale = await Sale.exists({ productId: product._id, status: { $ne: 'cancelled' } });
    if (activeSale) {
      return { error: m.activeSaleExists };
    }
  }

  const prevSalePrice = product.salePrice;
  const prevPurchasePrice = product.purchasePrice;
  if (!canViewCost) purchasePrice = prevPurchasePrice;

  if (locationStatus === 'sold' && features.creditKassa && soldPaymentType === 'credit') {
    const bank = await CreditBank.findOne({ name: soldBankName, active: true }).lean();
    if (!bank) return { error: m.bankNotFound };
  }

  if (phoneShop) {
    const dup = await Product.findOne({ imei: imeiRaw, _id: { $ne: productId } }).lean();
    if (dup) return { error: m.imeiDupOther };
  }

  const supplierChoice = await readSupplierChoice(formData, user, Supplier);
  if (supplierChoice === 'invalid') return { error: (await getDict()).stock.suppliers.msg.badSupplier };
  if (supplierChoice !== 'keep') product.supplierId = supplierChoice ?? undefined;

  product.name = name;
  if (phoneShop) product.imei = imeiRaw;
  product.barcode = barcode || undefined;
  product.color = color || undefined;
  product.notes = notes || undefined;
  product.photoUrl = photoUrl || undefined;
  product.purchasePrice = purchasePrice;
  product.salePrice = salePrice;
  product.wholesalePrice = wholesalePrice || undefined;
  product.oldPrice = oldPrice || undefined;
  if (brand !== 'keep') product.brand = brand;
  // Faqat joriy yo'nalish maydonlari yangilanadi; boshqa yo'nalishdan qolgan qiymatlarga tegilmaydi.
  // Turkum tanlovi bo'lsa — kategoriya matni categoryId bo'yicha (pastda), yo'nalish maydonidan emas
  for (const key of extra.keys) {
    if (key === 'category' && categoryChoice !== 'keep') continue;
    product.set(key, extra.values[key]);
  }
  if (categoryChoice === null) {
    product.categoryId = undefined;
    product.category = undefined;
  } else if (categoryChoice && typeof categoryChoice === 'object') {
    product.categoryId = categoryChoice.categoryId;
    product.category = categoryChoice.category;
  }
  product.trackQuantity = trackQuantity;
  if (trackQuantity) {
    // Birlik shu formada o'zgargan bo'lishi mumkin — yangisi bo'yicha (kg → kasr, dona → butun)
    const quantity = parseQtyField(quantityRaw, 1, product.unit);
    // Kasrda sotilgan mahsulotni butun birlikka (kg → dona) o'tkazib bo'lmaydi — sotuv tarixi buziladi
    if (!isFractionalUnit(product.unit) && !Number.isInteger(product.soldQuantity ?? 0)) {
      return { error: m.unitNeedsFraction };
    }
    if (roundQty(quantity - product.soldQuantity) < 0) {
      return { error: m.qtyBelowSold };
    }
    product.quantity = quantity;
  } else {
    product.quantity = 1;
    product.soldQuantity = product.status === 'sold' ? 1 : 0;
  }
  if (!product.productId) product.productId = generateProductCode();
  if (!product.createdBy) product.createdBy = user.username;

  const prevStatus = product.status;

  const locationErr = applyLocationStatus(
    product,
    locationStatus,
    soldPaymentType,
    soldBankName,
    features.creditKassa,
    m
  );
  if (locationErr) return locationErr;

  // Amallar tarixini yozish
  if (!Array.isArray(product.history)) product.history = [];
  const now = new Date();
  if (product.status === 'sold' && prevStatus !== 'sold') {
    product.soldAt = now;
    product.history.push({ action: 'sold', detail: fmtSum(product.salePrice), by: user.username, at: now });
  } else if (prevStatus === 'sold' && product.status === 'in_stock') {
    product.soldAt = undefined;
    product.history.push({ action: 'returned', by: user.username, at: now });
  } else {
    product.history.push({ action: 'edited', by: user.username, at: now });
  }

  try {
    await product.save();
    const priceChanged = prevSalePrice !== salePrice || prevPurchasePrice !== purchasePrice;
    await recordAudit(user, {
      action: priceChanged ? 'product.price_change' : 'product.update',
      entity: 'product',
      entityId: productId,
      summary: priceChanged
        ? `Narx o'zgardi: ${name} (sotuv ${fmtSum(prevSalePrice)} → ${fmtSum(salePrice)})`
        : `Mahsulot tahrirlandi: ${name}`,
      meta: priceChanged
        ? { prevSalePrice, salePrice, prevPurchasePrice, purchasePrice }
        : undefined,
    });
    revalidatePath('/app');
    revalidatePath('/app/products');
    revalidatePath(`/app/products/${productId}`);
    return { success: m.saved };
  } catch {
    return { error: m.saveFailed };
  }
}

/** Ro'yxatdan tezkor: mahsulotni sotilgan deb belgilash (naqd) + Sotuv yozuvi */
export async function quickMarkSoldAction(_prev: State, formData: FormData): Promise<State> {
  const { user, Product, Sale } = await getTenantSession();
  { const denied = await checkPermission(user, 'sale.create'); if (denied) return denied; }
  const dict = await getDict();
  const m = dict.stock.msg;
  const canEditPrice = await userCan(user, 'sale.editPrice');
  const productId = String(formData.get('productId') || '');
  const qtyRaw = String(formData.get('qty') || '1');
  const priceRaw = String(formData.get('salePrice') || '').trim();
  if (!productId || !Types.ObjectId.isValid(productId)) return { error: m.notFound };

  const scope = branchFilter(user);
  const found = await Product.findOne({ _id: productId, ...scope }).lean();
  if (!found) return { error: m.notFound };
  if (found.status !== 'in_stock') return { error: m.alreadySold };

  // Sotilgan narx: kiritilgan bo'lsa yangilanadi; bo'lmasa mavjud narx
  let salePrice = found.salePrice;
  if (priceRaw) {
    const p = parseOptionalPrice(priceRaw);
    if (p === null || p <= 0) return { error: m.soldPriceInvalid };
    // Narxi bor mahsulotda narxni o'zgartirish — "sale.editPrice" huquqi kerak (quickSaleBatchAction bilan bir xil)
    if (!canEditPrice && found.salePrice > 0 && p !== found.salePrice) return permissionDeniedError('sale.editPrice');
    // Sotuv narxidan arzon sotish — "sale.discount" huquqi kerak (createSaleAction bilan bir xil)
    if (found.salePrice > 0 && p < found.salePrice && !(await userCan(user, 'sale.discount'))) return permissionDeniedError('sale.discount');
    salePrice = p;
  }
  if (!salePrice || salePrice <= 0) {
    return { error: 'PRICE_REQUIRED' };
  }

  // dona — butun, kg/m… — ≤3 xona kasr; qoldiqdan oshsa qoldiqqacha qisqaradi
  const picked = clampQtyToStock(found, parseQty(qtyRaw, found.unit));
  if (!picked.ok) return { error: picked.reason === 'noStock' ? m.noStock : m.sellQtyInvalid };
  const saleQty = picked.qty;

  const now = new Date();
  const totalAmount = priceTimesQty(salePrice, saleQty);

  // Atomik: qoldiq tekshiruvi + ayirish bitta so'rovda (parallel sotuvda minusga tushmaydi)
  const product = await reserveStock(Product, found._id, saleQty, {
    scope,
    set: { salePrice, soldPaymentType: 'cash' },
    history: { action: 'sold', detail: `${qtyLabel(saleQty, found.unit)} · ${fmtSum(totalAmount)}`, by: user.username, at: now },
  });
  if (!product) return { error: m.notEnoughStock };

  try {
    // Sotuv yozuvi — "Sotildi" sahifasida ko'rinadi
    const { generateSaleNo } = await import('@/lib/sales');
    try {
      const saleNo = await generateSaleNo(Sale);
      await Sale.create({
        saleNo,
        productId: product._id,
        productSnapshot: {
          name: product.name,
          imei: product.imei,
          purchasePrice: product.purchasePrice,
          saleQuantity: saleQty,
          unit: found.unit,
        },
        branchId: product.branchId,
        paymentType: 'cash',
        totalAmount,
        paidAmount: totalAmount,
        remainingAmount: 0,
        status: 'paid',
        payments: [{ amount: totalAmount, paidAt: now, recordedBy: user.username }],
        soldBy: user.username,
      });
    } catch (err) {
      // Kompensatsiya: sotuv yozilmasa — mahsulot omborga qaytadi
      await releaseStock(Product, product._id, saleQty);
      throw err;
    }
    await recordAudit(user, {
      action: 'sale.quick',
      entity: 'sale',
      entityId: String(product._id),
      summary: `Tez sotuv: ${product.name} · ${qtyLabel(saleQty, found.unit)} · ${fmtSum(totalAmount)}`,
      meta: { saleQty, totalAmount },
    });
    await markOnboardingStep(user.organizationId, 'saleMade');
    revalidatePath('/app');
    revalidatePath('/app/products');
    revalidatePath('/app/sales');
    revalidatePath(`/app/products/${productId}`);
    return { success: tr(m.soldN, { n: qtyWithUnit(saleQty, found.unit, dict.stock.fields.units) }) };
  } catch {
    return { error: m.saveFailed };
  }
}

/** Yangi mahsulot formasi: shtrix-kod omborda bormi va ochiq bazadan nomi (mobil /api/mobile/products/lookup bilan bir xil) */
export async function lookupBarcodeAction(code: string): Promise<BarcodeLookupResult> {
  const { user, Product } = await getTenantSession();
  if (!(await userCan(user, 'product.create'))) return { existing: null, suggestion: null };
  return lookupBarcode(Product, code, branchFilter(user));
}

type CatalogResult<T> = { ok: true; item: T } | { ok: false; error: string };

/** Katalogga (brend/turkum) yozish — mahsulot qo'shish yoki tahrirlash huquqi bilan (mobil: product.create) */
async function catalogWriter() {
  const session = await getTenantSession();
  const allowed = (await userCan(session.user, 'product.create')) || (await userCan(session.user, 'product.edit'));
  return { session, denied: allowed ? null : permissionDeniedError('product.create') };
}

/** Formadan yangi brend. Shu nomli brend bo'lsa — mavjudini qaytaradi (mobil API bilan bir xil) */
export async function createBrandAction(rawName: string): Promise<CatalogResult<{ id: string; name: string }>> {
  const { session, denied } = await catalogWriter();
  if (denied) return { ok: false, error: denied.error };
  const m = (await getDict()).stock.msg;
  const name = normalizeCatalogName(rawName);
  if (!name) return { ok: false, error: m.brandNameRequired };
  if (name.length > BRAND_NAME_MAX) return { ok: false, error: m.brandNameTooLong };
  const { Brand, user } = session;
  const b = await findOrCreateBrand(Brand, name, user.username);
  return { ok: true, item: { id: b.id, name: b.name } };
}

/**
 * Formadan yangi turkum (ixtiyoriy ota turkum ichida). Shu darajada shu nomli bo'lsa — mavjudi qaytadi.
 * Chuqurlik chegarasi — CATEGORY_MAX_DEPTH (mobil /api/mobile/catalog/categories bilan bir xil).
 */
export async function createCategoryAction(
  rawName: string,
  rawParentId: string | null,
): Promise<CatalogResult<{ id: string; name: string; parentId: string | null }>> {
  const { session, denied } = await catalogWriter();
  if (denied) return { ok: false, error: denied.error };
  const m = (await getDict()).stock.msg;
  const name = normalizeCatalogName(rawName);
  if (!name) return { ok: false, error: m.categoryNameRequired };
  if (name.length > CATEGORY_NAME_MAX) return { ok: false, error: m.categoryNameTooLong };
  const { ProductCategory, user } = session;

  let parentId: Types.ObjectId | null = null;
  if (rawParentId) {
    const level = await categoryLevelInDb(ProductCategory, String(rawParentId));
    if (!level) return { ok: false, error: m.categoryNotFound };
    // Yangi turkum darajasi = ota darajasi + 1
    if (level >= CATEGORY_MAX_DEPTH) return { ok: false, error: tr(m.categoryTooDeep, { n: CATEGORY_MAX_DEPTH }) };
    parentId = new Types.ObjectId(String(rawParentId));
  }

  const id = await findOrCreateCategory(ProductCategory, name, parentId, user.username);
  const c = await ProductCategory.findById(id, { name: 1 }).lean();
  return { ok: true, item: { id: String(id), name: c?.name ?? name, parentId: parentId ? String(parentId) : null } };
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  // O'chirish — "product.delete" huquqi kerak (admin doim ega). Filial login faqat o'z filiali mahsulotini.
  const { user, Product, Sale } = await getTenantSession();
  if (!(await userCan(user, 'product.delete'))) redirect('/app/products?denied=1');
  const productId = String(formData.get('productId') || '');
  if (!productId || !Types.ObjectId.isValid(productId)) return;

  // Sotuv tarixi bor mahsulot o'chirilmaydi (moliyaviy yozuvlar yetim qolmasin)
  const hasSales = await Sale.exists({ productId });
  if (hasSales) redirect(`/app/products/${productId}?deleteBlocked=1`);

  // Soft-delete: IMEI/kod bo'shatiladi (shu IMEI bilan qayta qo'shish mumkin), asl qiymat deletedValues'da
  const deleted = await softDeleteOne(Product, { _id: productId, ...branchFilter(user) }, user.username, ['imei', 'productId']);
  if (!deleted) redirect('/app/products');
  await recordAudit(user, {
    action: 'product.delete',
    entity: 'product',
    entityId: productId,
    summary: `Mahsulot o'chirildi: ${deleted?.name ?? productId}`,
    meta: deleted ? { imei: deleted.imei, salePrice: deleted.salePrice } : undefined,
  });
  revalidatePath('/app');
  revalidatePath('/app/products');
  redirect('/app/products?deleted=1');
}

/** CSV import: IMEI,Nom,Rang,Kelish,Sotuv,Izoh */
export async function importProductsAction(_prev: State, formData: FormData): Promise<State> {
  const { user, Product, Branch } = await getTenantSession();
  { const denied = await checkPermission(user, 'product.create'); if (denied) return denied; }
  const m = (await getDict()).stock.msg;

  const csv = String(formData.get('csv') || '').trim();
  // Filial-login — faqat O'Z filialiga import qiladi (boshqa filial omboriga yozolmaydi);
  // admin — asosiy ombor/birinchi faol filial
  const warehouseBranchId = isBranchScoped(user) ? user.branchId! : await resolveWarehouseBranchId(Branch);

  if (!warehouseBranchId) return { error: m.noActiveBranch };
  if (!csv) return { error: m.csvRequired };

  if (!Types.ObjectId.isValid(warehouseBranchId)) return { error: m.warehouseBranchNotFound };
  const branch = await Branch.findOne({ _id: warehouseBranchId, active: true }).lean();
  if (!branch) return { error: m.warehouseBranchNotFound };

  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { error: m.emptyFile };

  const start = lines[0].toLowerCase().includes('imei') ? 1 : 0;
  let imported = 0;
  const errors: string[] = [];

  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 2) {
      errors.push(tr(m.rowFewFields, { n: i + 1 }));
      continue;
    }

    const imei = normalizeImei(cols[0]);
    const name = cols[1];
    const color = cols[2] || undefined;
    const purchasePrice = parsePrice(cols[3] ?? '0');
    const salePrice = parsePrice(cols[4] ?? '0');
    const notes = cols[5] || undefined;

    if (!imei || imei.length < 10) {
      errors.push(tr(m.rowImeiInvalid, { n: i + 1 }));
      continue;
    }
    if (!name) {
      errors.push(tr(m.rowNoName, { n: i + 1 }));
      continue;
    }
    if (purchasePrice === null || salePrice === null) {
      errors.push(tr(m.rowPriceInvalid, { n: i + 1 }));
      continue;
    }

    const dup = await Product.findOne({ imei }).lean();
    if (dup) {
      errors.push(tr(m.rowDup, { n: i + 1, imei }));
      continue;
    }

    try {
      await Product.create({
        productId: generateProductCode(),
        name,
        imei,
        color,
        purchasePrice,
        salePrice,
        trackQuantity: false,
        quantity: 1,
        soldQuantity: 0,
        status: 'in_stock',
        branchId: warehouseBranchId,
        notes,
        createdBy: user.username,
      });
      imported++;
    } catch {
      errors.push(tr(m.rowSaveFailed, { n: i + 1 }));
    }
  }

  await recordAudit(user, {
    action: 'product.import',
    entity: 'product',
    summary: `CSV import: ${imported} ta mahsulot (${branch.name})${errors.length ? `, ${errors.length} ta xato` : ''}`,
    meta: { imported, errors: errors.length, errorSamples: errors.slice(0, 5) },
  });

  revalidatePath('/app');
  revalidatePath('/app/products');

  if (imported === 0) {
    return { error: errors[0] ?? m.nothingImported };
  }

  const msg = `${tr(m.imported, { n: imported })}${errors.length ? ` ${tr(m.importErrors, { n: errors.length })}` : ''}`;
  return errors.length ? { success: msg, error: errors.slice(0, 5).join('; ') } : { success: msg };
}
