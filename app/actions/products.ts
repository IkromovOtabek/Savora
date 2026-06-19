'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Types } from 'mongoose';
import { getTenantSession } from '@/lib/tenantSession';
import { isPhoneShop } from '@/lib/businessTypes';
import { ProductStatus } from '@/lib/models/tenant/Product';
import { generateProductCode } from '@/lib/productId';
import { parseQtyField, resolveStatusAfterSale } from '@/lib/productQuantity';
import { resolveWarehouseBranchId } from '@/lib/warehouseBranch';
import { recordAudit } from '@/lib/audit';
import { markOnboardingStep } from '@/lib/onboarding';

type State = { error?: string; success?: string } | null;
type LocationStatus = 'warehouse' | 'sold' | 'branch';

function parsePrice(v: string): number | null {
  const n = Number(v.replace(/\s/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Ixtiyoriy narx: bo'sh bo'lsa 0, noto'g'ri bo'lsa null */
function parseOptionalPrice(v: string): number | null {
  const t = v.replace(/\s/g, '').trim();
  if (!t) return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function normalizeImei(v: string): string {
  return v.trim().replace(/\s/g, '').toUpperCase();
}

function fmtSum(n: number): string {
  return new Intl.NumberFormat('uz-UZ').format(n) + ' so\'m';
}

function parseLocationStatus(v: string): LocationStatus {
  if (v === 'sold' || v === 'branch') return v;
  return 'warehouse';
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
  warehouseBranchId: string,
  targetBranchId: string,
  soldPaymentType: 'cash' | 'credit',
  soldBankName: string,
  creditKassaEnabled: boolean,
  sellQty: number
): State {
  if (locationStatus === 'sold') {
    if (product.trackQuantity) {
      const available = product.quantity - product.soldQuantity;
      if (sellQty < 1) return { error: 'Sotilgan son kamida 1 bo\'lishi kerak.' };
      if (sellQty > available) return { error: `Omborda faqat ${available} ta qoldi.` };
      product.soldQuantity += sellQty;
      product.status = resolveStatusAfterSale(product.trackQuantity, product.quantity, product.soldQuantity);
    } else {
      product.status = 'sold';
    }
    if (creditKassaEnabled && soldPaymentType === 'credit') {
      if (!soldBankName) return { error: 'Kredit uchun bank tanlanishi shart.' };
      product.soldPaymentType = 'credit';
      product.soldBankName = soldBankName;
    } else {
      product.soldPaymentType = 'cash';
      product.soldBankName = undefined;
    }
    return null;
  }

  product.soldPaymentType = undefined;
  product.soldBankName = undefined;

  if (locationStatus === 'branch') {
    if (!targetBranchId || !Types.ObjectId.isValid(targetBranchId)) {
      return { error: 'Filial tanlanishi shart.' };
    }
    if (targetBranchId === warehouseBranchId) {
      return { error: 'Filialga berish uchun boshqa filialni tanlang.' };
    }
    product.branchId = new Types.ObjectId(targetBranchId);
    product.status = 'in_stock';
    return null;
  }

  product.branchId = new Types.ObjectId(warehouseBranchId);
  product.status = 'in_stock';
  if (locationStatus === 'warehouse') product.soldQuantity = 0;
  return null;
}

function generateSku(): string {
  return `SKU-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function createProductAction(_prev: State, formData: FormData): Promise<State> {
  const { user, org, Product, Branch } = await getTenantSession();
  const phoneShop = isPhoneShop(org);

  const name = String(formData.get('name') || '').trim();
  let imei = normalizeImei(String(formData.get('imei') || ''));
  const barcode = String(formData.get('barcode') || '').trim();
  const color = String(formData.get('color') || '').trim();
  const notes = String(formData.get('notes') || '').trim();
  const photoUrl = String(formData.get('photoUrl') || '').trim();
  const purchasePrice = parsePrice(String(formData.get('purchasePrice') || ''));
  const salePrice = parseOptionalPrice(String(formData.get('salePrice') || ''));
  const trackQuantity = formData.get('trackQuantity') === 'on';
  const quantity = trackQuantity ? parseQtyField(String(formData.get('quantity') || '1')) : 1;

  if (!name) return { error: 'Mahsulot nomi kiritilishi shart.' };
  if (phoneShop) {
    if (!imei || imei.length < 10) return { error: 'IMEI kamida 10 ta belgidan iborat bo\'lishi kerak.' };
  } else {
    if (barcode) imei = normalizeImei(barcode);
    else imei = generateSku();
  }
  if (purchasePrice === null) return { error: 'Kelish narxi noto\'g\'ri.' };
  if (salePrice === null) return { error: 'Sotuv narxi noto\'g\'ri.' };

  const warehouseBranchId = await resolveWarehouseBranchId(Branch);
  if (!warehouseBranchId) return { error: 'Faol filial topilmadi. Avval filial qo\'shing.' };

  const branch = await Branch.findOne({ _id: warehouseBranchId, active: true }).lean();
  if (!branch) return { error: 'Ombor filiali topilmadi yoki faol emas.' };

  const dup = await Product.findOne({ imei }).lean();
  if (dup) return { error: 'Bu IMEI allaqachon ro\'yxatda.' };

  try {
    const product = await Product.create({
      productId: generateProductCode(),
      name,
      imei,
      barcode: barcode || undefined,
      color: color || undefined,
      purchasePrice,
      salePrice,
      trackQuantity,
      quantity,
      soldQuantity: 0,
      status: 'in_stock',
      branchId: warehouseBranchId,
      notes: notes || undefined,
      photoUrl: photoUrl || undefined,
      createdBy: user.username,
      history: [{ action: 'created', detail: branch.name, by: user.username, at: new Date() }],
    });
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
    return { error: 'Mahsulot qo\'shishda xatolik.' };
  }
}

export async function updateProductAction(_prev: State, formData: FormData): Promise<State> {
  const { user, org, Product, Branch, CreditBank, features } = await getTenantSession();
  const phoneShop = isPhoneShop(org);

  const productId = String(formData.get('productId') || '');
  const name = String(formData.get('name') || '').trim();
  const imeiRaw = normalizeImei(String(formData.get('imei') || ''));
  const barcode = String(formData.get('barcode') || '').trim();
  const color = String(formData.get('color') || '').trim();
  const targetBranchId = String(formData.get('branchId') || '');
  const warehouseBranchId =
    String(formData.get('warehouseBranchId') || '') || (await resolveWarehouseBranchId(Branch)) || '';
  const locationStatus = parseLocationStatus(String(formData.get('locationStatus') || 'warehouse'));
  const soldPaymentType = String(formData.get('soldPaymentType') || 'cash') === 'credit' ? 'credit' : 'cash';
  const soldBankName = String(formData.get('soldBankName') || '').trim();
  const notes = String(formData.get('notes') || '').trim();
  const photoUrl = String(formData.get('photoUrl') || '').trim();
  const purchasePrice = parsePrice(String(formData.get('purchasePrice') || ''));
  const salePrice = parseOptionalPrice(String(formData.get('salePrice') || ''));
  const trackQuantity = formData.get('trackQuantity') === 'on';
  const quantity = trackQuantity ? parseQtyField(String(formData.get('quantity') || '1')) : 1;
  const sellQty = parseQtyField(String(formData.get('sellQty') || '1'));

  if (!productId) return { error: 'Mahsulot topilmadi.' };
  if (!name) return { error: 'Mahsulot nomi kiritilishi shart.' };
  if (phoneShop && (!imeiRaw || imeiRaw.length < 10)) return { error: 'IMEI noto\'g\'ri.' };
  if (purchasePrice === null) return { error: 'Kelish narxi noto\'g\'ri.' };
  if (salePrice === null) return { error: 'Sotuv narxi noto\'g\'ri.' };
  if (!warehouseBranchId || !Types.ObjectId.isValid(warehouseBranchId)) {
    return { error: 'Ombor filiali topilmadi.' };
  }

  const product = await Product.findById(productId);
  if (!product) return { error: 'Mahsulot topilmadi.' };

  const prevSalePrice = product.salePrice;
  const prevPurchasePrice = product.purchasePrice;

  if (locationStatus === 'branch') {
    const branch = await Branch.findOne({ _id: targetBranchId, active: true }).lean();
    if (!branch) return { error: 'Filial topilmadi yoki faol emas.' };
  }

  if (locationStatus === 'sold' && features.creditKassa && soldPaymentType === 'credit') {
    const bank = await CreditBank.findOne({ name: soldBankName, active: true }).lean();
    if (!bank) return { error: 'Tanlangan bank topilmadi yoki faol emas.' };
  }

  if (phoneShop) {
    const dup = await Product.findOne({ imei: imeiRaw, _id: { $ne: productId } }).lean();
    if (dup) return { error: 'Bu IMEI boshqa mahsulotda mavjud.' };
  }

  product.name = name;
  if (phoneShop) product.imei = imeiRaw;
  product.barcode = barcode || undefined;
  product.color = color || undefined;
  product.notes = notes || undefined;
  product.photoUrl = photoUrl || undefined;
  product.purchasePrice = purchasePrice;
  product.salePrice = salePrice;
  product.trackQuantity = trackQuantity;
  if (trackQuantity) {
    if (quantity < product.soldQuantity) {
      return { error: 'Umumiy son sotilgan miqdordan kam bo\'lmasligi kerak.' };
    }
    product.quantity = quantity;
  } else {
    product.quantity = 1;
    product.soldQuantity = product.status === 'sold' ? 1 : 0;
  }
  if (!product.productId) product.productId = generateProductCode();
  if (!product.createdBy) product.createdBy = user.username;

  const prevStatus = product.status;
  const prevBranchId = String(product.branchId);

  const locationErr = applyLocationStatus(
    product,
    locationStatus,
    warehouseBranchId,
    targetBranchId,
    soldPaymentType,
    soldBankName,
    features.creditKassa,
    sellQty
  );
  if (locationErr) return locationErr;

  // Amallar tarixini yozish
  if (!Array.isArray(product.history)) product.history = [];
  const now = new Date();
  if (product.status === 'sold' && prevStatus !== 'sold') {
    product.soldAt = now;
    product.history.push({ action: 'sold', detail: fmtSum(product.salePrice), by: user.username, at: now });
  } else if (locationStatus === 'branch' && String(product.branchId) !== prevBranchId) {
    const target = await Branch.findById(targetBranchId).lean();
    product.history.push({ action: 'transferred', detail: target?.name, by: user.username, at: now });
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
    return { success: 'Mahsulot saqlandi.' };
  } catch {
    return { error: 'Saqlashda xatolik.' };
  }
}

/** Ro'yxatdan tezkor: mahsulotni sotilgan deb belgilash (naqd) + Sotuv yozuvi */
export async function quickMarkSoldAction(_prev: State, formData: FormData): Promise<State> {
  const { user, Product, Sale } = await getTenantSession();
  const productId = String(formData.get('productId') || '');
  const qty = parseQtyField(String(formData.get('qty') || '1'));
  const priceRaw = String(formData.get('salePrice') || '').trim();
  if (!productId) return { error: 'Mahsulot topilmadi.' };

  const product = await Product.findById(productId);
  if (!product) return { error: 'Mahsulot topilmadi.' };
  if (product.status === 'sold') return { error: 'Mahsulot allaqachon sotilgan.' };

  // Sotilgan narx: kiritilgan bo'lsa yangilanadi; bo'lmasa mavjud narx
  if (priceRaw) {
    const p = parseOptionalPrice(priceRaw);
    if (p === null || p <= 0) return { error: 'Sotilgan narx noto\'g\'ri.' };
    product.salePrice = p;
  }
  if (!product.salePrice || product.salePrice <= 0) {
    return { error: 'PRICE_REQUIRED' };
  }

  let saleQty = 1;
  if (product.trackQuantity) {
    const available = product.quantity - product.soldQuantity;
    if (available < 1) return { error: 'Omborda qoldiq yo\'q.' };
    saleQty = Math.min(qty, available);
    if (saleQty < 1) return { error: 'Sotiladigan son noto\'g\'ri.' };
    product.soldQuantity += saleQty;
    product.status = resolveStatusAfterSale(product.trackQuantity, product.quantity, product.soldQuantity);
  } else {
    saleQty = 1;
    product.status = 'sold';
  }
  product.soldPaymentType = 'cash';
  product.soldBankName = undefined;

  const now = new Date();
  if (product.status === 'sold') product.soldAt = now;
  if (!Array.isArray(product.history)) product.history = [];
  product.history.push({
    action: 'sold',
    detail: `${saleQty} ta · ${fmtSum(product.salePrice * saleQty)}`,
    by: user.username,
    at: now,
  });

  const totalAmount = product.salePrice * saleQty;

  try {
    await product.save();
    // Sotuv yozuvi — "Sotildi" sahifasida ko'rinadi
    const { generateSaleNo } = await import('@/lib/sales');
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
    return { success: `${saleQty} ta sotildi.` };
  } catch {
    return { error: 'Saqlashda xatolik.' };
  }
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  const { user, Product } = await getTenantSession();
  const productId = String(formData.get('productId') || '');
  if (!productId) return;

  const deleted = await Product.findByIdAndDelete(productId).lean();
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

  const csv = String(formData.get('csv') || '').trim();
  const warehouseBranchId = await resolveWarehouseBranchId(Branch);

  if (!warehouseBranchId) return { error: 'Faol filial topilmadi.' };
  if (!csv) return { error: 'CSV matn kiritilishi shart.' };

  const branch = await Branch.findOne({ _id: warehouseBranchId, active: true }).lean();
  if (!branch) return { error: 'Ombor filiali topilmadi.' };

  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { error: 'Bo\'sh fayl.' };

  const start = lines[0].toLowerCase().includes('imei') ? 1 : 0;
  let imported = 0;
  const errors: string[] = [];

  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 2) {
      errors.push(`Qator ${i + 1}: maydon yetarli emas`);
      continue;
    }

    const imei = normalizeImei(cols[0]);
    const name = cols[1];
    const color = cols[2] || undefined;
    const purchasePrice = parsePrice(cols[3] ?? '0');
    const salePrice = parsePrice(cols[4] ?? '0');
    const notes = cols[5] || undefined;

    if (!imei || imei.length < 10) {
      errors.push(`Qator ${i + 1}: IMEI noto'g'ri`);
      continue;
    }
    if (!name) {
      errors.push(`Qator ${i + 1}: nom yo'q`);
      continue;
    }
    if (purchasePrice === null || salePrice === null) {
      errors.push(`Qator ${i + 1}: narx noto'g'ri`);
      continue;
    }

    const dup = await Product.findOne({ imei }).lean();
    if (dup) {
      errors.push(`Qator ${i + 1}: ${imei} allaqachon mavjud`);
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
      errors.push(`Qator ${i + 1}: saqlash xatosi`);
    }
  }

  revalidatePath('/app');
  revalidatePath('/app/products');

  if (imported === 0) {
    return { error: errors[0] ?? 'Hech narsa import qilinmadi.' };
  }

  const msg = `${imported} ta mahsulot import qilindi.${errors.length ? ` ${errors.length} ta xato.` : ''}`;
  return errors.length ? { success: msg, error: errors.slice(0, 5).join('; ') } : { success: msg };
}
