'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Types } from 'mongoose';
import { getTenantSession } from '@/lib/tenantSession';
import { parsePrice } from '@/lib/format';
import { calcSaleStatus, generateSaleNo } from '@/lib/sales';
import { PaymentType } from '@/lib/models/tenant/Sale';
import { sendTelegram, tgEscape } from '@/lib/telegram';
import { featureDisabledError } from '@/lib/featureAction';
import { isOwnUploadUrl } from '@/lib/fileUrl';
import { parseQtyField, getStockQty } from '@/lib/productQuantity';
import { reserveStock, releaseStock } from '@/lib/stock';
import { addMonthsClamped } from '@/lib/dates';
import { applySalePayment } from '@/lib/salePayment';
import { recordAudit } from '@/lib/audit';
import { markOnboardingStep } from '@/lib/onboarding';
import { branchFilter } from '@/lib/branchScope';
import { logError } from '@/lib/logger';
import { checkPermission, userCan } from '@/lib/permissionGuard';
import { permissionDeniedError } from '@/lib/permissions';
import { pq294MonthsError } from '@/lib/pq294';
import { getI18n } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import { computePartialReturn } from '@/lib/saleReturn';

type State = { error?: string; success?: string } | null;

function normalizeImei(v: string): string {
  return v.trim().replace(/\s/g, '').toUpperCase();
}

function parsePaymentType(v: string): PaymentType {
  if (v === 'cash' || v === 'debt' || v === 'installment' || v === 'bank_credit') return v;
  return 'cash';
}

export type ScannedProduct = {
  id: string;
  productId: string;
  name: string;
  imei: string;
  barcode?: string;
  brand: string;
  deviceModel: string;
  salePrice: number;
  purchasePrice: number;
  branchId: string;
  branchName: string;
  trackQuantity: boolean;
  available: number;
};

function toScannedProduct(
  product: {
    _id: unknown;
    productId?: string;
    name: string;
    imei: string;
    barcode?: string;
    brand?: string;
    deviceModel?: string;
    salePrice: number;
    purchasePrice: number;
    branchId: unknown;
    trackQuantity?: boolean;
    quantity: number;
    soldQuantity: number;
    status: string;
  },
  branchName: string,
  canViewCost: boolean,
): ScannedProduct {
  return {
    id: String(product._id),
    productId: product.productId ?? String(product._id).slice(-8).toUpperCase(),
    name: product.name,
    imei: product.imei,
    barcode: product.barcode,
    brand: product.brand ?? '',
    deviceModel: product.deviceModel ?? '',
    salePrice: product.salePrice,
    // Kelish narxi — faqat "product.viewCost" huquqi bo'lsa (xodimga brauzer orqali sizib chiqmasin)
    purchasePrice: canViewCost ? product.purchasePrice : 0,
    branchId: String(product.branchId),
    branchName,
    trackQuantity: product.trackQuantity ?? false,
    available: getStockQty({
      trackQuantity: product.trackQuantity ?? false,
      quantity: product.quantity,
      soldQuantity: product.soldQuantity,
      status: product.status as 'in_stock' | 'sold',
    }),
  };
}

export async function lookupProductByImei(imei: string): Promise<ScannedProduct | null> {
  const { user, Product, Branch } = await getTenantSession();
  const normalized = normalizeImei(imei);
  if (!normalized) return null;

  const product = await Product.findOne({ ...branchFilter(user), imei: normalized, status: 'in_stock' }).lean();
  if (!product) return null;

  const branch = await Branch.findById(product.branchId).lean();
  return toScannedProduct(product, branch?.name ?? '—', await userCan(user, 'product.viewCost'));
}

/** Shtrix, IMEI yoki mahsulot kodi bo'yicha qidiruv (skaner pistalet uchun) */
export async function lookupProductByScan(code: string): Promise<ScannedProduct | null> {
  const { user, Product, Branch } = await getTenantSession();
  const trimmed = code.trim();
  if (!trimmed) return null;

  const qNoSpace = trimmed.replace(/\s/g, '');
  const upper = qNoSpace.toUpperCase();

  const product = await Product.findOne({
    ...branchFilter(user),
    status: 'in_stock',
    $or: [
      { barcode: trimmed },
      { barcode: qNoSpace },
      { imei: upper },
      { productId: upper },
    ],
  }).lean();
  if (!product) return null;

  const branch = await Branch.findById(product.branchId).lean();
  return toScannedProduct(product, branch?.name ?? '—', await userCan(user, 'product.viewCost'));
}

export type QuickSaleLine = { productId: string; qty: number; salePrice?: number };

/** Tez sotuv — bir nechta mahsulotni naqd sotish */
export async function quickSaleBatchAction(items: QuickSaleLine[]): Promise<State> {
  const { user, Product, Sale, features } = await getTenantSession();
  const m = (await getI18n()).d.sales.actions;
  if (!features.sales) return featureDisabledError('sales');
  { const denied = await checkPermission(user, 'sale.create'); if (denied) return denied; }
  const canEditPrice = await userCan(user, 'sale.editPrice');
  if (!items.length) return { error: m.noProductsSelected };

  const scope = branchFilter(user);
  let soldCount = 0;
  let soldTotal = 0;

  try {
    for (const item of items) {
      if (!item.productId || !Types.ObjectId.isValid(item.productId)) {
        return { error: m.badProductId };
      }

      const found = await Product.findOne({ _id: item.productId, ...scope }).lean();
      if (!found) return { error: m.productNotFoundOrDenied };
      if (found.status !== 'in_stock') {
        return { error: tr(m.productNotInStock, { name: found.name }) };
      }

      const saleQty = found.trackQuantity ? parseQtyField(String(item.qty || 1)) : 1;
      if (saleQty < 1) return { error: m.badQty };

      let salePrice = found.salePrice;
      if (item.salePrice != null && item.salePrice > 0) {
        if (!Number.isSafeInteger(item.salePrice)) return { error: m.priceWhole };
        // Narxi bor mahsulotda narxni o'zgartirish — "sale.editPrice" huquqi kerak
        if (!canEditPrice && found.salePrice > 0 && item.salePrice !== found.salePrice) return permissionDeniedError('sale.editPrice');
        salePrice = item.salePrice;
      }
      if (!salePrice || salePrice <= 0) {
        return { error: tr(m.enterPriceFor, { name: found.name }) };
      }

      const now = new Date();
      const lineTotal = salePrice * saleQty;

      // Atomik: qoldiq tekshiruvi + ayirish bitta so'rovda (parallel sotuvda minusga tushmaydi)
      const product = await reserveStock(Product, found._id, saleQty, {
        scope,
        set: { salePrice, soldPaymentType: 'cash' },
        history: {
          action: 'sold',
          detail: `${saleQty} ta · ${lineTotal.toLocaleString('uz-UZ')} so'm`,
          by: user.username,
          at: now,
        },
      });
      if (!product) {
        return { error: tr(m.notEnoughStockFor, { name: found.name }) };
      }

      try {
        const saleNo = await generateSaleNo(Sale);
        await Sale.create({
          saleNo,
          productId: product._id,
          productSnapshot: {
            name: product.name,
            imei: product.imei,
            brand: product.brand,
            deviceModel: product.deviceModel,
            purchasePrice: product.purchasePrice,
            saleQuantity: saleQty,
          },
          branchId: product.branchId,
          paymentType: 'cash',
          totalAmount: lineTotal,
          paidAmount: lineTotal,
          remainingAmount: 0,
          status: 'paid',
          payments: [{ amount: lineTotal, paidAt: now, recordedBy: user.username }],
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
        summary: `Tez sotuv: ${product.name} · ${saleQty} ta · ${lineTotal.toLocaleString('uz-UZ')} so'm`,
        meta: { saleQty, totalAmount: lineTotal },
      });

      soldCount += saleQty;
      soldTotal += lineTotal;
    }

    await markOnboardingStep(user.organizationId, 'saleMade');
    revalidatePath('/app');
    revalidatePath('/app/products');
    revalidatePath('/app/sales');
    return { success: tr(m.quickSold, { n: soldCount, sum: soldTotal.toLocaleString('uz-UZ') }) };
  } catch (err) {
    logError('quickSaleBatchAction failed', err, { user: user.username, dbName: user.dbName });
    return { error: m.sellFailed };
  }
}

export async function createSaleAction(_prev: State, formData: FormData): Promise<State> {
  const { user, Product, Customer, Sale, CreditBank, features } = await getTenantSession();
  const { locale, d } = await getI18n();
  const m = d.sales.actions;
  if (!features.sales) return featureDisabledError('sales');
  { const denied = await checkPermission(user, 'sale.create'); if (denied) return denied; }

  const productId = String(formData.get('productId') || '');
  const customerName = String(formData.get('customerName') || '').trim();
  const customerPhone = String(formData.get('customerPhone') || '').trim();
  const saleQtyRaw = String(formData.get('saleQty') || '1');
  let paymentType = parsePaymentType(String(formData.get('paymentType') || 'cash'));
  const totalAmount = parsePrice(String(formData.get('totalAmount') || ''));
  const paidAmountRaw = parsePrice(String(formData.get('paidAmount') || '0'));
  const installmentMonthsRaw = Number(formData.get('installmentMonths') || 0);
  const notes = String(formData.get('notes') || '').trim();
  const photoUrl = String(formData.get('photoUrl') || '').trim();
  const bankName = String(formData.get('bankName') || '').trim();
  const dueDateRaw = String(formData.get('dueDate') || '').trim();

  if (!productId || !Types.ObjectId.isValid(productId)) return { error: m.productRequired };
  if (totalAmount === null || totalAmount <= 0) return { error: m.badTotal };
  // Rasm: faqat o'zimizning storage URL'i + «Rasm/kamera» moduli yoqilgan bo'lsa
  if (photoUrl) {
    if (!features.mediaUpload) return featureDisabledError('mediaUpload');
    if (!isOwnUploadUrl(photoUrl)) return { error: m.badPhotoUrl };
  }

  if (paidAmountRaw === null) return { error: m.badPaid };

  // Filial login faqat o'z filiali mahsulotini sotadi (IDOR himoyasi)
  const product = await Product.findOne({ _id: productId, ...branchFilter(user) }).lean();
  if (!product || product.status !== 'in_stock') {
    return { error: m.notInStock };
  }

  const saleQty = product.trackQuantity ? parseQtyField(saleQtyRaw) : 1;
  if (product.trackQuantity) {
    const available = product.quantity - product.soldQuantity;
    if (saleQty > available) return { error: tr(m.onlyNLeft, { n: available }) };
  }
  // Sotuv narxidan arzon sotish — "sale.discount" huquqi kerak
  if (product.salePrice > 0 && totalAmount < product.salePrice * saleQty && !(await userCan(user, 'sale.discount'))) return permissionDeniedError('sale.discount');
  // Sotuv narxidan qimmat sotish (narxni o'zgartirish) — "sale.editPrice" huquqi kerak (quickSaleBatchAction bilan bir xil)
  if (product.salePrice > 0 && totalAmount > product.salePrice * saleQty && !(await userCan(user, 'sale.editPrice'))) return permissionDeniedError('sale.editPrice');

  let customer = null;
  if (customerName && customerPhone) {
    // Shu telefonli mijoz bor bo'lsa — uning ismi USTIDAN YOZILMAYDI (sotuvchi boshqa mijoz
    // kartochkasini o'zgartirib yubormasin); mijoz ismi "Mijozlar" bo'limida tahrirlanadi
    customer = await Customer.findOne({ phone: customerPhone }).lean();
    if (!customer) {
      customer = (await Customer.create({ fullName: customerName, phone: customerPhone })).toObject();
    }
  }

  let paidAmount = paymentType === 'cash' ? totalAmount : (paidAmountRaw ?? 0);
  if (paidAmount > totalAmount) return { error: m.paidExceeds };

  if (paymentType === 'installment' && !features.variant && !features.nasiya) {
    return { error: m.nasiyaDisabled };
  }
  if (paymentType === 'bank_credit' && !features.creditKassa) {
    return { error: m.creditKassaDisabled };
  }

  if (paymentType === 'bank_credit' && !bankName) {
    return { error: m.bankRequired };
  }
  if (paymentType === 'bank_credit' && features.creditKassa) {
    const bank = await CreditBank.findOne({ name: bankName, active: true }).lean();
    if (!bank) return { error: m.bankNotFound };
  }

  let installmentMonths: number | undefined;
  if (paymentType === 'installment') {
    installmentMonths = Number.isFinite(installmentMonthsRaw) && installmentMonthsRaw >= 1
      ? Math.min(60, Math.floor(installmentMonthsRaw))
      : undefined;
    if (!installmentMonths) return { error: m.monthsRequired };
    const pqErr = pq294MonthsError(installmentMonths, new Date(), locale);
    if (pqErr) return { error: pqErr };
  }

  const remainingAmount = Math.max(0, totalAmount - paidAmount);
  const status = calcSaleStatus(totalAmount, paidAmount);

  // To'lov muddati — faqat qarz/nasiya/kredit va qoldiq bo'lsa
  let dueDate: Date | undefined;
  if (remainingAmount > 0 && paymentType !== 'cash') {
    if (dueDateRaw) {
      const d = new Date(dueDateRaw);
      if (!Number.isNaN(d.getTime())) dueDate = d;
    }
    // Nasiya bo'lsa va muddat kiritilmagan bo'lsa — oxirgi oy bo'yicha hisoblaymiz
    if (!dueDate && paymentType === 'installment' && installmentMonths) {
      dueDate = addMonthsClamped(new Date(), installmentMonths);
    }
  }

  const payments = paidAmount > 0
    ? [{ amount: paidAmount, paidAt: new Date(), note: paymentType === 'cash' ? 'Naqd to\'lov' : 'Boshlang\'ich to\'lov', recordedBy: user.username }]
    : [];

  // Atomik: qoldiq tekshiruvi + ayirish bitta so'rovda. Sotuv yozilmasa — qaytariladi.
  const reserved = await reserveStock(Product, product._id, saleQty, {
    scope: branchFilter(user),
    history: { action: 'sold', detail: `${saleQty} ta`, by: user.username, at: new Date() },
  });
  if (!reserved) {
    return { error: m.notEnoughStock };
  }

  try {
    let saleNo: string;
    let sale;
    try {
      saleNo = await generateSaleNo(Sale);
      sale = await Sale.create({
      saleNo,
      productId: product._id,
      productSnapshot: {
        name: product.name,
        imei: product.imei,
        brand: product.brand,
        deviceModel: product.deviceModel,
        purchasePrice: product.purchasePrice,
        saleQuantity: saleQty,
      },
      ...(customer
        ? {
            customerId: customer._id,
            customerSnapshot: { fullName: customer.fullName, phone: customer.phone },
          }
        : {}),
      branchId: product.branchId,
      paymentType,
      bankName: paymentType === 'bank_credit' ? bankName : undefined,
      totalAmount,
      paidAmount,
      remainingAmount,
      installmentMonths,
      // Nasiya boshlang'ich to'lovi = sotuv paytidagi paidAmount (oy jadvali shu asosda)
      downPayment: paymentType === 'installment' ? paidAmount : undefined,
      dueDate,
      status,
      payments,
      soldBy: user.username,
      notes: notes || undefined,
      photoUrl: photoUrl || undefined,
    });
    } catch (err) {
      // Kompensatsiya: sotuv yozilmasa — mahsulot omborga qaytadi
      await releaseStock(Product, product._id, saleQty);
      throw err;
    }

    await recordAudit(user, {
      action: 'sale.create',
      entity: 'sale',
      entityId: String(sale._id),
      summary: `Sotuv ${saleNo}: ${product.name} · ${saleQty} ta · ${totalAmount.toLocaleString('uz-UZ')} so'm (${paymentType})`,
      meta: { saleQty, totalAmount, paymentType },
    });
    await markOnboardingStep(user.organizationId, 'saleMade');

    void sendTelegram(
      `<b>Savora — Yangi sotuv</b>\n` +
      `${tgEscape(saleNo)} · ${tgEscape(product.name)} (${saleQty} ta)\n` +
      (customer ? `Mijoz: ${tgEscape(customer.fullName)}\n` : '') +
      `Summa: ${totalAmount.toLocaleString('uz-UZ')} so'm\n` +
      `To'lov: ${tgEscape(paymentType)}${bankName ? ` (${tgEscape(bankName)})` : ''}`,
    );

    revalidatePath('/app');
    revalidatePath('/app/sales');
    revalidatePath('/app/products');
    redirect(`/app/sales/${sale._id}?created=1`);
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    logError('createSaleAction failed', err, { user: user.username, dbName: user.dbName });
    return { error: m.saleFailed };
  }
}

export async function addSalePaymentAction(_prev: State, formData: FormData): Promise<State> {
  const { user, Sale } = await getTenantSession();
  const m = (await getI18n()).d.sales.actions;
  { const denied = await checkPermission(user, 'payment.accept'); if (denied) return denied; }

  const saleId = String(formData.get('saleId') || '');
  const amount = parsePrice(String(formData.get('amount') || ''));
  const note = String(formData.get('note') || '').trim();

  if (!saleId || !Types.ObjectId.isValid(saleId)) return { error: m.saleNotFound };
  if (amount === null || amount <= 0) return { error: m.badPaymentAmount };

  // Filial login faqat o'z filiali sotuviga to'lov qo'shadi
  const sale = await Sale.findOne({ _id: saleId, ...branchFilter(user) }).lean();
  if (!sale) return { error: m.saleNotFound };
  if (sale.status === 'cancelled') return { error: m.cancelledNoPayment };
  if (sale.status === 'paid') return { error: m.alreadyPaid };
  if (amount > sale.remainingAmount) return { error: tr(m.remainingIs, { sum: sale.remainingAmount.toLocaleString('uz-UZ') }) };

  // Atomik: qoldiq sharti bilan bitta yozuv — ikki parallel to'lov ortiqcha to'lovga olib kelmaydi
  const res = await applySalePayment(Sale, saleId, amount, {
    scope: branchFilter(user),
    note: note || undefined,
    recordedBy: user.username,
  });
  if (!res) return { error: m.paymentConflict };

  await recordAudit(user, {
    action: 'sale.payment',
    entity: 'sale',
    entityId: saleId,
    summary: `To'lov qabul qilindi: ${sale.saleNo} · ${amount.toLocaleString('uz-UZ')} so'm (qoldiq ${res.remainingAmount.toLocaleString('uz-UZ')} so'm)`,
    meta: { amount, remaining: res.remainingAmount, status: res.status },
  });

  revalidatePath('/app/sales');
  revalidatePath(`/app/sales/${saleId}`);
  revalidatePath('/app');
  return { success: m.paymentAdded };
}

export async function cancelSaleAction(_prev: State, formData: FormData): Promise<State> {
  // Admin — doim; filial login — faqat "sale.cancel" huquqi bo'lsa va faqat o'z filiali sotuvini
  const { user, Product, Sale } = await getTenantSession();
  const m = (await getI18n()).d.sales.actions;
  { const denied = await checkPermission(user, 'sale.cancel'); if (denied) return denied; }

  const saleId = String(formData.get('saleId') || '');
  if (!saleId || !Types.ObjectId.isValid(saleId)) return { error: m.saleNotFound };

  // Idempotent: faqat bekor qilinmagan sotuv bir marta "cancelled" ga o'tadi —
  // ikki marta bosilsa ham mahsulot omborga ikki marta qaytmaydi.
  const scope = branchFilter(user);
  const sale = await Sale.findOneAndUpdate(
    { _id: saleId, ...scope, status: { $ne: 'cancelled' } },
    { $set: { status: 'cancelled', remainingAmount: 0 } },
    { new: false }
  ).lean();
  if (!sale) {
    const exists = await Sale.exists({ _id: saleId, ...scope });
    return { error: exists ? m.alreadyCancelled : m.saleNotFound };
  }

  if (sale.productId) {
    const saleQty = sale.productSnapshot?.saleQuantity ?? 1;
    await releaseStock(Product, sale.productId, saleQty, {
      action: 'returned',
      detail: `Sotuv ${sale.saleNo} bekor qilindi`,
      by: user.username,
      at: new Date(),
    });
  }

  await recordAudit(user, {
    action: 'sale.cancel',
    entity: 'sale',
    entityId: saleId,
    summary: `Sotuv bekor qilindi: ${sale.saleNo} · ${sale.productSnapshot?.name ?? ''} · ${sale.totalAmount.toLocaleString('uz-UZ')} so'm`,
    meta: { paidAmount: sale.paidAmount, paymentType: sale.paymentType, totalAmount: sale.totalAmount },
  });

  revalidatePath('/app/sales');
  revalidatePath(`/app/sales/${saleId}`);
  revalidatePath('/app/products');
  revalidatePath('/app');
  return { success: m.saleCancelled };
}

/**
 * Qisman qaytarish — sotuvdan bir necha dona omborga qaytadi, summa kamayadi.
 * Avval qarz kamayadi, ortig'i mijozga naqd qaytariladi (kunlik kassada chiqim bo'lib ko'rinadi).
 * Huquq: "sale.cancel" (omborga qaytarish = bekor qilishning bir qismi).
 */
export async function returnSaleItemsAction(_prev: State, formData: FormData): Promise<State> {
  const { user, Product, Sale } = await getTenantSession();
  const m = (await getI18n()).d.sales.actions;
  { const denied = await checkPermission(user, 'sale.cancel'); if (denied) return denied; }

  const saleId = String(formData.get('saleId') || '');
  const returnQty = Number(String(formData.get('qty') || '').trim());
  const reason = String(formData.get('reason') || '').trim().slice(0, 300);
  if (!saleId || !Types.ObjectId.isValid(saleId)) return { error: m.saleNotFound };

  const scope = branchFilter(user);
  const sale = await Sale.findOne({ _id: saleId, ...scope }).lean();
  if (!sale) return { error: m.saleNotFound };

  const qty = sale.productSnapshot?.saleQuantity ?? 1;
  const res = computePartialReturn({
    qty,
    totalAmount: sale.totalAmount,
    paidAmount: sale.paidAmount,
    remainingAmount: sale.remainingAmount,
    paymentType: sale.paymentType,
    status: sale.status,
  }, returnQty);
  if (!res.ok) {
    const err = {
      cancelled: m.alreadyCancelled,
      bankCredit: m.returnBankCredit,
      badQty: m.returnBadQty,
      useCancel: m.returnUseCancel,
    }[res.error];
    return { error: err };
  }
  const c = res.calc;
  const now = new Date();

  // Optimistik qulf: sotuv o'qilgandan beri o'zgarmagan bo'lsagina yoziladi —
  // ikki marta bosish yoki parallel to'lov ikki marta qaytarishga olib kelmaydi.
  const updated = await Sale.findOneAndUpdate(
    {
      _id: saleId,
      ...scope,
      status: { $ne: 'cancelled' },
      totalAmount: sale.totalAmount,
      paidAmount: sale.paidAmount,
      remainingAmount: sale.remainingAmount,
      'productSnapshot.saleQuantity': qty, // qisman qaytarish faqat qty > 1 da — maydon doim bor
    },
    {
      $set: {
        'productSnapshot.saleQuantity': c.newQty,
        totalAmount: c.newTotal,
        paidAmount: c.newPaid,
        remainingAmount: c.newRemaining,
        status: c.newStatus,
      },
      $push: {
        returns: {
          qty: returnQty,
          amount: c.amount,
          debtReduced: c.debtReduced,
          refundAmount: c.refundAmount,
          reason: reason || undefined,
          returnedAt: now,
          by: user.username,
        },
      },
    },
    { new: true }
  ).lean();
  if (!updated) return { error: m.returnConflict };

  if (sale.productId) {
    await releaseStock(Product, sale.productId, returnQty, {
      action: 'returned',
      detail: `Sotuv ${sale.saleNo}: ${returnQty} dona qaytarildi`,
      by: user.username,
      at: now,
    });
  }

  await recordAudit(user, {
    action: 'sale.return',
    entity: 'sale',
    entityId: saleId,
    summary: `Qaytarish: ${sale.saleNo} · ${returnQty} dona · ${c.amount.toLocaleString('uz-UZ')} so'm (naqd qaytarildi ${c.refundAmount.toLocaleString('uz-UZ')} so'm)`,
    meta: { qty: returnQty, amount: c.amount, debtReduced: c.debtReduced, refundAmount: c.refundAmount, reason },
  });

  revalidatePath('/app/sales');
  revalidatePath(`/app/sales/${saleId}`);
  revalidatePath('/app/products');
  revalidatePath('/app/kassa');
  revalidatePath('/app');
  return {
    success: c.refundAmount > 0
      ? tr(m.returnedRefund, { n: returnQty, sum: c.refundAmount.toLocaleString('uz-UZ') })
      : tr(m.returnedNoRefund, { n: returnQty }),
  };
}
