'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Types } from 'mongoose';
import { getTenantSession, getTenantAdminSession } from '@/lib/tenantSession';
import { parsePrice } from '@/lib/format';
import { calcSaleStatus, generateSaleNo } from '@/lib/sales';
import { PaymentType } from '@/lib/models/tenant/Sale';
import { sendTelegram } from '@/lib/telegram';
import { featureDisabledError } from '@/lib/featureAction';
import { parseQtyField, getStockQty } from '@/lib/productQuantity';
import { reserveStock, releaseStock } from '@/lib/stock';
import { addMonthsClamped } from '@/lib/dates';
import { applySalePayment } from '@/lib/salePayment';
import { recordAudit } from '@/lib/audit';
import { markOnboardingStep } from '@/lib/onboarding';
import { branchFilter } from '@/lib/branchScope';
import { logError } from '@/lib/logger';

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
    purchasePrice: product.purchasePrice,
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
  return toScannedProduct(product, branch?.name ?? '—');
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
  return toScannedProduct(product, branch?.name ?? '—');
}

export type QuickSaleLine = { productId: string; qty: number; salePrice?: number };

/** Tez sotuv — bir nechta mahsulotni naqd sotish */
export async function quickSaleBatchAction(items: QuickSaleLine[]): Promise<State> {
  const { user, Product, Sale, features } = await getTenantSession();
  if (!features.sales) return featureDisabledError('sales');
  if (!items.length) return { error: 'Sotish uchun mahsulot tanlanmagan.' };

  const scope = branchFilter(user);
  let soldCount = 0;
  let soldTotal = 0;

  try {
    for (const item of items) {
      if (!item.productId || !Types.ObjectId.isValid(item.productId)) {
        return { error: 'Mahsulot identifikatori noto\'g\'ri.' };
      }

      const found = await Product.findOne({ _id: item.productId, ...scope }).lean();
      if (!found) return { error: 'Mahsulot topilmadi yoki ruxsat yo\'q.' };
      if (found.status !== 'in_stock') {
        return { error: `"${found.name}" omborda emas yoki allaqachon sotilgan.` };
      }

      const saleQty = found.trackQuantity ? parseQtyField(String(item.qty || 1)) : 1;
      if (saleQty < 1) return { error: 'Sotiladigan son noto\'g\'ri.' };

      let salePrice = found.salePrice;
      if (item.salePrice != null && item.salePrice > 0) {
        if (!Number.isSafeInteger(item.salePrice)) return { error: 'Narx butun so\'mda bo\'lishi kerak.' };
        salePrice = item.salePrice;
      }
      if (!salePrice || salePrice <= 0) {
        return { error: `"${found.name}" uchun sotuv narxini kiriting.` };
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
        return { error: `"${found.name}" omborda yetarli emas yoki allaqachon sotilgan.` };
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
    return { success: `${soldCount} ta sotildi · ${soldTotal.toLocaleString('uz-UZ')} so'm` };
  } catch (err) {
    logError('quickSaleBatchAction failed', err, { user: user.username, dbName: user.dbName });
    return { error: 'Sotishda xatolik yuz berdi.' };
  }
}

export async function createSaleAction(_prev: State, formData: FormData): Promise<State> {
  const { user, Product, Customer, Sale, CreditBank, features } = await getTenantSession();
  if (!features.sales) return featureDisabledError('sales');

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

  if (!productId || !Types.ObjectId.isValid(productId)) return { error: 'Mahsulot tanlanishi shart.' };
  if (totalAmount === null || totalAmount <= 0) return { error: 'Sotuv summasi noto\'g\'ri.' };

  if (paidAmountRaw === null) return { error: 'To\'langan summa noto\'g\'ri (butun so\'mda kiriting).' };

  // Filial login faqat o'z filiali mahsulotini sotadi (IDOR himoyasi)
  const product = await Product.findOne({ _id: productId, ...branchFilter(user) }).lean();
  if (!product || product.status !== 'in_stock') {
    return { error: 'Mahsulot omborda emas yoki allaqachon sotilgan.' };
  }

  const saleQty = product.trackQuantity ? parseQtyField(saleQtyRaw) : 1;
  if (product.trackQuantity) {
    const available = product.quantity - product.soldQuantity;
    if (saleQty > available) return { error: `Omborda faqat ${available} ta qoldi.` };
  }

  let customer = null;
  if (customerName && customerPhone) {
    customer = await Customer.findOne({ phone: customerPhone }).lean();
    if (!customer) {
      customer = (await Customer.create({ fullName: customerName, phone: customerPhone })).toObject();
    } else if (customer.fullName !== customerName) {
      await Customer.findByIdAndUpdate(customer._id, { fullName: customerName });
      customer = { ...customer, fullName: customerName };
    }
  }

  let paidAmount = paymentType === 'cash' ? totalAmount : (paidAmountRaw ?? 0);
  if (paidAmount > totalAmount) return { error: 'To\'langan summa jami summadan oshmasligi kerak.' };

  if (paymentType === 'installment' && !features.variant && !features.nasiya) {
    return { error: 'Nasiya (bo\'lib to\'lash) moduli yoqilmagan.' };
  }
  if (paymentType === 'bank_credit' && !features.creditKassa) {
    return { error: 'Kredit kassa moduli yoqilmagan.' };
  }

  if (paymentType === 'bank_credit' && !bankName) {
    return { error: 'Bank tanlanishi shart.' };
  }
  if (paymentType === 'bank_credit' && features.creditKassa) {
    const bank = await CreditBank.findOne({ name: bankName, active: true }).lean();
    if (!bank) return { error: 'Tanlangan bank topilmadi yoki faol emas.' };
  }

  let installmentMonths: number | undefined;
  if (paymentType === 'installment') {
    installmentMonths = Number.isFinite(installmentMonthsRaw) && installmentMonthsRaw >= 1
      ? Math.min(60, Math.floor(installmentMonthsRaw))
      : undefined;
    if (!installmentMonths) return { error: 'Nasiya oylari kiritilishi shart (1–60).' };
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
    return { error: 'Mahsulot omborda yetarli emas yoki allaqachon sotilgan.' };
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
      `${saleNo} · ${product.name} (${saleQty} ta)\n` +
      (customer ? `Mijoz: ${customer.fullName}\n` : '') +
      `Summa: ${totalAmount.toLocaleString('uz-UZ')} so'm\n` +
      `To'lov: ${paymentType}${bankName ? ` (${bankName})` : ''}`,
    );

    revalidatePath('/app');
    revalidatePath('/app/sales');
    revalidatePath('/app/products');
    redirect(`/app/sales/${sale._id}?created=1`);
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    logError('createSaleAction failed', err, { user: user.username, dbName: user.dbName });
    return { error: 'Sotuvda xatolik yuz berdi.' };
  }
}

export async function addSalePaymentAction(_prev: State, formData: FormData): Promise<State> {
  const { user, Sale } = await getTenantSession();

  const saleId = String(formData.get('saleId') || '');
  const amount = parsePrice(String(formData.get('amount') || ''));
  const note = String(formData.get('note') || '').trim();

  if (!saleId || !Types.ObjectId.isValid(saleId)) return { error: 'Sotuv topilmadi.' };
  if (amount === null || amount <= 0) return { error: 'To\'lov summasi noto\'g\'ri.' };

  // Filial login faqat o'z filiali sotuviga to'lov qo'shadi
  const sale = await Sale.findOne({ _id: saleId, ...branchFilter(user) }).lean();
  if (!sale) return { error: 'Sotuv topilmadi.' };
  if (sale.status === 'cancelled') return { error: 'Bekor qilingan sotuvga to\'lov qo\'shib bo\'lmaydi.' };
  if (sale.status === 'paid') return { error: 'Bu sotuv allaqachon to\'liq to\'langan.' };
  if (amount > sale.remainingAmount) return { error: `Qoldiq: ${sale.remainingAmount.toLocaleString('uz-UZ')} so'm.` };

  // Atomik: qoldiq sharti bilan bitta yozuv — ikki parallel to'lov ortiqcha to'lovga olib kelmaydi
  const res = await applySalePayment(Sale, saleId, amount, {
    scope: branchFilter(user),
    note: note || undefined,
    recordedBy: user.username,
  });
  if (!res) return { error: 'To\'lov qo\'shilmadi: qoldiq o\'zgargan. Sahifani yangilab qayta urinib ko\'ring.' };

  revalidatePath('/app/sales');
  revalidatePath(`/app/sales/${saleId}`);
  revalidatePath('/app');
  return { success: 'To\'lov qo\'shildi.' };
}

export async function cancelSaleAction(_prev: State, formData: FormData): Promise<State> {
  const { user, Product, Sale } = await getTenantAdminSession();

  const saleId = String(formData.get('saleId') || '');
  if (!saleId || !Types.ObjectId.isValid(saleId)) return { error: 'Sotuv topilmadi.' };

  // Idempotent: faqat bekor qilinmagan sotuv bir marta "cancelled" ga o'tadi —
  // ikki marta bosilsa ham mahsulot omborga ikki marta qaytmaydi.
  const sale = await Sale.findOneAndUpdate(
    { _id: saleId, status: { $ne: 'cancelled' } },
    { $set: { status: 'cancelled', remainingAmount: 0 } },
    { new: false }
  ).lean();
  if (!sale) {
    const exists = await Sale.exists({ _id: saleId });
    return { error: exists ? 'Allaqachon bekor qilingan.' : 'Sotuv topilmadi.' };
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

  revalidatePath('/app/sales');
  revalidatePath(`/app/sales/${saleId}`);
  revalidatePath('/app/products');
  revalidatePath('/app');
  return { success: 'Sotuv bekor qilindi. Mahsulot omborga qaytdi.' };
}
