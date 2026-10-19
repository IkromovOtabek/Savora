'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Types } from 'mongoose';
import { getTenantSession } from '@/lib/tenantSession';
import { parsePrice } from '@/lib/format';
import { calcSaleStatus, generateSaleNo } from '@/lib/sales';
import { PaymentType } from '@/lib/models/tenant/Sale';
import type { ProductUnit } from '@/lib/businessTypes';
import { sendTelegram, tgEscape } from '@/lib/telegram';
import { featureDisabledError } from '@/lib/featureAction';
import { isOwnUploadUrl } from '@/lib/fileUrl';
import { checkSaleQty, getStockQty } from '@/lib/productQuantity';
import { isFractionalUnit, priceTimesQty, qtyLabel } from '@/lib/qty';
import { reserveStock, releaseStock } from '@/lib/stock';
import { runWithCompensation } from '@/lib/compensate';
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
import { qtyWithUnit, tr } from '@/lib/i18n/fmt';
import { computePartialReturn } from '@/lib/saleReturn';
import { z } from 'zod';
import { formToObject, parseInput, zId, zText, zMoney, zInt, zOptInt, zOptQty, zOptDate, zField } from '@/lib/validation';

/** Tez sotuvda bir martada eng ko'p qator (savatcha) — haddan katta so'rovdan himoya */
const QUICK_SALE_MAX_LINES = 100;

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
  /** O'lchov birligi — kg/m… bo'lsa miqdor kasr kiritiladi */
  unit: ProductUnit | null;
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
    unit?: ProductUnit;
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
    unit: product.unit ?? null,
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
  // Client'dan to'g'ridan-to'g'ri keladigan massiv — shakli, soni va qiymatlari tekshiriladi
  const parsed = parseInput(
    z.array(z.object({
      productId: zId(m.badProductId),
      qty: zOptQty(m.badQty),
      salePrice: zMoney(m.priceWhole, { optional: true }),
    })).min(1, m.noProductsSelected).max(QUICK_SALE_MAX_LINES, m.noProductsSelected),
    items,
    m.noProductsSelected,
  );
  if (!parsed.ok) return { error: parsed.error };
  const lines = parsed.data;

  const scope = branchFilter(user);

  // "Hammasi yoki hech biri": biror qator o'tmasa, oldingi qatorlar bekor qilinadi
  // (sotuv yozuvi o'chadi, mahsulot omborga qaytadi). Audit faqat to'liq muvaffaqiyatdan keyin.
  let failMsg: string | null = null;
  const outcome = await runWithCompensation(lines, async (item) => {
    const found = await Product.findOne({ _id: item.productId, ...scope }).lean();
    if (!found) { failMsg = m.productNotFoundOrDenied; return null; }
    if (found.status !== 'in_stock') { failMsg = tr(m.productNotInStock, { name: found.name }); return null; }

    const qtyCheck = checkSaleQty(found, item.qty);
    if (!qtyCheck.ok) {
      failMsg = qtyCheck.reason === 'badQty' ? m.badQty : tr(m.notEnoughStockFor, { name: found.name });
      return null;
    }
    const saleQty = qtyCheck.qty;

    let salePrice = found.salePrice;
    if (item.salePrice > 0) {
      // Narxi bor mahsulotda narxni o'zgartirish — "sale.editPrice" huquqi kerak
      if (!canEditPrice && found.salePrice > 0 && item.salePrice !== found.salePrice) {
        failMsg = permissionDeniedError('sale.editPrice').error;
        return null;
      }
      salePrice = item.salePrice;
    }
    if (!salePrice || salePrice <= 0) { failMsg = tr(m.enterPriceFor, { name: found.name }); return null; }

    const now = new Date();
    const lineTotal = priceTimesQty(salePrice, saleQty);

    // Atomik: qoldiq tekshiruvi + ayirish bitta so'rovda (parallel sotuvda minusga tushmaydi)
    const product = await reserveStock(Product, found._id, saleQty, {
      scope,
      set: { salePrice, soldPaymentType: 'cash' },
      history: {
        action: 'sold',
        detail: `${qtyLabel(saleQty, found.unit)} · ${lineTotal.toLocaleString('uz-UZ')} so'm`,
        by: user.username,
        at: now,
      },
    });
    if (!product) { failMsg = tr(m.notEnoughStockFor, { name: found.name }); return null; }
    const restock = async () => {
      await releaseStock(Product, product._id, saleQty, { action: 'returned', detail: 'Tez sotuv yakunlanmadi', by: user.username, at: new Date() });
      // Narx o'zgartirilgan bo'lsa — eski katalog narxi tiklanadi
      if (salePrice !== found.salePrice) await Product.updateOne({ _id: product._id }, { $set: { salePrice: found.salePrice } });
    };

    let saleId: unknown;
    try {
      const saleNo = await generateSaleNo(Sale);
      const sale = await Sale.create({
        saleNo,
        productId: product._id,
        productSnapshot: {
          name: product.name,
          imei: product.imei,
          brand: product.brand,
          deviceModel: product.deviceModel,
          purchasePrice: product.purchasePrice,
          saleQuantity: saleQty,
          unit: product.unit,
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
      saleId = sale._id;
    } catch (err) {
      await restock();
      throw err;
    }
    return {
      result: { productId: String(product._id), name: product.name, saleQty, unit: found.unit, lineTotal },
      undo: async () => { await Sale.deleteOne({ _id: saleId }); await restock(); },
    };
  });

  if (!outcome.ok) {
    if (outcome.error) logError('quickSaleBatchAction failed', outcome.error, { user: user.username, dbName: user.dbName });
    return { error: failMsg ?? m.sellFailed };
  }

  for (const r of outcome.results) {
    await recordAudit(user, {
      action: 'sale.quick',
      entity: 'sale',
      entityId: r.productId,
      summary: `Tez sotuv: ${r.name} · ${qtyLabel(r.saleQty, r.unit)} · ${r.lineTotal.toLocaleString('uz-UZ')} so'm`,
      meta: { saleQty: r.saleQty, totalAmount: r.lineTotal },
    });
  }
  // Birliklar aralash bo'lsa (kg + dona) miqdorlarni qo'shib bo'lmaydi — unda qatorlar soni
  const soldCount = outcome.results.some((r) => isFractionalUnit(r.unit))
    ? outcome.results.length
    : outcome.results.reduce((s, r) => s + r.saleQty, 0);
  const soldTotal = outcome.results.reduce((s, r) => s + r.lineTotal, 0);

  await markOnboardingStep(user.organizationId, 'saleMade');
  revalidatePath('/app');
  revalidatePath('/app/products');
  revalidatePath('/app/sales');
  return { success: tr(m.quickSold, { n: soldCount, sum: soldTotal.toLocaleString('uz-UZ') }) };
}

export async function createSaleAction(_prev: State, formData: FormData): Promise<State> {
  const { user, Product, Customer, Sale, CreditBank, features } = await getTenantSession();
  const { locale, d } = await getI18n();
  const m = d.sales.actions;
  if (!features.sales) return featureDisabledError('sales');
  { const denied = await checkPermission(user, 'sale.create'); if (denied) return denied; }

  const tooLong = d.common.tooLong;
  const parsed = parseInput(z.object({
    productId: zId(m.productRequired),
    customerName: zText(120, tooLong),
    customerPhone: zText(40, tooLong),
    saleQty: zOptQty(m.badQty),
    paymentType: zField((v) => parsePaymentType(String(v ?? 'cash'))),
    totalAmount: zMoney(m.badTotal, { min: 1 }),
    paidAmount: zMoney(m.badPaid, { optional: true }),
    installmentMonths: zOptInt(m.monthsRequired, 1, 60),
    notes: zText(1000, tooLong),
    photoUrl: zText(500, m.badPhotoUrl),
    bankName: zText(120, tooLong),
    dueDate: zOptDate(d.common.invalidInput),
  }), formToObject(formData), d.common.invalidInput);
  if (!parsed.ok) return { error: parsed.error };
  const { productId, customerName, customerPhone, totalAmount, notes, photoUrl, bankName } = parsed.data;
  let paymentType = parsed.data.paymentType;
  const paidAmountRaw = parsed.data.paidAmount;
  const installmentMonthsRaw = parsed.data.installmentMonths ?? 0;

  // Rasm: faqat o'zimizning storage URL'i + «Rasm/kamera» moduli yoqilgan bo'lsa
  if (photoUrl) {
    if (!features.mediaUpload) return featureDisabledError('mediaUpload');
    if (!isOwnUploadUrl(photoUrl)) return { error: m.badPhotoUrl };
  }

  // Filial login faqat o'z filiali mahsulotini sotadi (IDOR himoyasi)
  const product = await Product.findOne({ _id: productId, ...branchFilter(user) }).lean();
  if (!product || product.status !== 'in_stock') {
    return { error: m.notInStock };
  }

  // dona — butun, kg/m… — ≤3 xona kasr
  const qtyCheck = checkSaleQty(product, parsed.data.saleQty);
  if (!qtyCheck.ok) {
    return { error: qtyCheck.reason === 'badQty' ? m.badQty : tr(m.onlyNLeft, { n: qtyWithUnit(qtyCheck.available, product.unit, d.stock.fields.units) }) };
  }
  const saleQty = qtyCheck.qty;
  // Ro'yxat narxi bo'yicha jami (kasr miqdorda butun so'mga yaxlitlangan)
  const listTotal = priceTimesQty(product.salePrice, saleQty);
  // Sotuv narxidan arzon sotish — "sale.discount" huquqi kerak
  if (product.salePrice > 0 && totalAmount < listTotal && !(await userCan(user, 'sale.discount'))) return permissionDeniedError('sale.discount');
  // Sotuv narxidan qimmat sotish (narxni o'zgartirish) — "sale.editPrice" huquqi kerak (quickSaleBatchAction bilan bir xil)
  if (product.salePrice > 0 && totalAmount > listTotal && !(await userCan(user, 'sale.editPrice'))) return permissionDeniedError('sale.editPrice');

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
    if (parsed.data.dueDate) dueDate = parsed.data.dueDate;
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
    history: { action: 'sold', detail: qtyLabel(saleQty, product.unit), by: user.username, at: new Date() },
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
        unit: product.unit,
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
      summary: `Sotuv ${saleNo}: ${product.name} · ${qtyLabel(saleQty, product.unit)} · ${totalAmount.toLocaleString('uz-UZ')} so'm (${paymentType})`,
      meta: { saleQty, totalAmount, paymentType },
    });
    await markOnboardingStep(user.organizationId, 'saleMade');

    void sendTelegram(
      `<b>Savora — Yangi sotuv</b>\n` +
      `${tgEscape(saleNo)} · ${tgEscape(product.name)} (${qtyLabel(saleQty, product.unit)})\n` +
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

  const parsed = parseInput(z.object({
    saleId: zId(m.saleNotFound),
    amount: zMoney(m.badPaymentAmount, { min: 1 }),
    note: zText(300, (await getI18n()).d.common.tooLong),
  }), formToObject(formData), m.badPaymentAmount);
  if (!parsed.ok) return { error: parsed.error };
  const { saleId, amount, note } = parsed.data;

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

  const parsed = parseInput(zId(m.saleNotFound), formData.get('saleId'));
  if (!parsed.ok) return { error: parsed.error };
  const saleId = parsed.data;

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
  const { d } = await getI18n();
  const m = d.sales.actions;
  { const denied = await checkPermission(user, 'sale.cancel'); if (denied) return denied; }

  const parsed = parseInput(z.object({
    saleId: zId(m.saleNotFound),
    qty: zOptQty(m.returnBadQty),
    reason: zText(300, (await getI18n()).d.common.tooLong),
  }), formToObject(formData), m.returnBadQty);
  if (!parsed.ok) return { error: parsed.error };
  const { saleId, reason } = parsed.data;
  if (parsed.data.qty === undefined) return { error: m.returnBadQty };
  const returnQty = parsed.data.qty;

  const scope = branchFilter(user);
  const sale = await Sale.findOne({ _id: saleId, ...scope }).lean();
  if (!sale) return { error: m.saleNotFound };

  const qty = sale.productSnapshot?.saleQuantity ?? 1;
  const unit = sale.productSnapshot?.unit;
  const res = computePartialReturn({
    qty,
    unit,
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
      detail: `Sotuv ${sale.saleNo}: ${qtyLabel(returnQty, unit)} qaytarildi`,
      by: user.username,
      at: now,
    });
  }

  await recordAudit(user, {
    action: 'sale.return',
    entity: 'sale',
    entityId: saleId,
    summary: `Qaytarish: ${sale.saleNo} · ${qtyLabel(returnQty, unit)} · ${c.amount.toLocaleString('uz-UZ')} so'm (naqd qaytarildi ${c.refundAmount.toLocaleString('uz-UZ')} so'm)`,
    meta: { qty: returnQty, amount: c.amount, debtReduced: c.debtReduced, refundAmount: c.refundAmount, reason },
  });

  revalidatePath('/app/sales');
  revalidatePath(`/app/sales/${saleId}`);
  revalidatePath('/app/products');
  revalidatePath('/app/kassa');
  revalidatePath('/app');
  return {
    success: c.refundAmount > 0
      ? tr(m.returnedRefund, { n: qtyWithUnit(returnQty, unit, d.stock.fields.units), sum: c.refundAmount.toLocaleString('uz-UZ') })
      : tr(m.returnedNoRefund, { n: qtyWithUnit(returnQty, unit, d.stock.fields.units) }),
  };
}
