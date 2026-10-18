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
import { parseQtyField } from '@/lib/productQuantity';
import { resolveWarehouseBranchId } from '@/lib/warehouseBranch';
import { recordAudit } from '@/lib/audit';
import { markOnboardingStep } from '@/lib/onboarding';
import { ensureMainBranchId } from '@/lib/mainBranch';
import { checkPermission, userCan } from '@/lib/permissionGuard';
import { permissionDeniedError } from '@/lib/permissions';
import { featureDisabledError } from '@/lib/featureAction';
import { isOwnUploadUrl } from '@/lib/fileUrl';
import { getDict, type Dict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import { logError } from '@/lib/logger';
import { softDeleteOne } from '@/lib/softDelete';

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
  const { user, org, Product, Branch, features, Supplier, SupplierEntry } = await getTenantSession();
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
  const quantity = trackQuantity ? parseQtyField(String(formData.get('quantity') || '1')) : 1;

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
      trackQuantity,
      quantity,
      soldQuantity: 0,
      status: 'in_stock',
      branchId: targetBranchId,
      notes: notes || undefined,
      photoUrl: photoUrl || undefined,
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
          amount: purchasePrice * quantity,
          note: quantity > 1 ? `${name} × ${quantity}` : name,
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
  const { user, org, Product, Sale, CreditBank, features, Supplier } = await getTenantSession();
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
  const quantity = trackQuantity ? parseQtyField(String(formData.get('quantity') || '1')) : 1;

  if (!productId) return { error: m.notFound };
  if (!name) return { error: m.nameRequired };
  if (phoneShop && (!imeiRaw || imeiRaw.length < 10)) return { error: m.imeiInvalid };
  if (purchasePrice === null) return { error: m.purchaseInvalid };
  if (salePrice === null) return { error: m.saleInvalid };
  if (wholesalePrice === null) return { error: m.wholesaleInvalid };
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
  product.trackQuantity = trackQuantity;
  if (trackQuantity) {
    if (quantity < product.soldQuantity) {
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
  const m = (await getDict()).stock.msg;
  const canEditPrice = await userCan(user, 'sale.editPrice');
  const productId = String(formData.get('productId') || '');
  const qty = parseQtyField(String(formData.get('qty') || '1'));
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

  let saleQty = 1;
  if (found.trackQuantity) {
    const available = found.quantity - found.soldQuantity;
    if (available < 1) return { error: m.noStock };
    saleQty = Math.min(qty, available);
    if (saleQty < 1) return { error: m.sellQtyInvalid };
  }

  const now = new Date();
  const totalAmount = salePrice * saleQty;

  // Atomik: qoldiq tekshiruvi + ayirish bitta so'rovda (parallel sotuvda minusga tushmaydi)
  const product = await reserveStock(Product, found._id, saleQty, {
    scope,
    set: { salePrice, soldPaymentType: 'cash' },
    history: { action: 'sold', detail: `${saleQty} ta · ${fmtSum(totalAmount)}`, by: user.username, at: now },
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
      summary: `Tez sotuv: ${product.name} · ${saleQty} ta · ${fmtSum(totalAmount)}`,
      meta: { saleQty, totalAmount },
    });
    await markOnboardingStep(user.organizationId, 'saleMade');
    revalidatePath('/app');
    revalidatePath('/app/products');
    revalidatePath('/app/sales');
    revalidatePath(`/app/products/${productId}`);
    return { success: tr(m.soldN, { n: saleQty }) };
  } catch {
    return { error: m.saveFailed };
  }
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
