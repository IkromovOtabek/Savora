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
import { parseQtyField, resolveStatusAfterSale, getStockQty } from '@/lib/productQuantity';
import { recordAudit } from '@/lib/audit';
import { markOnboardingStep } from '@/lib/onboarding';
import { branchFilter } from '@/lib/branchScope';

type State = { error?: string; success?: string } | null;

function normalizeImei(v: string): string {
  return v.trim().replace(/\s/g, '').toUpperCase();
}

function parsePaymentType(v: string): PaymentType {
  if (v === 'cash' || v === 'debt' || v === 'installment' || v === 'bank_credit') return v;
  return 'cash';
}

export async function lookupProductByImei(imei: string) {
  const { user, Product, Branch } = await getTenantSession();
  const normalized = normalizeImei(imei);
  if (!normalized) return null;

  // Filial login — faqat o'z filiali mahsulotini topadi
  const product = await Product.findOne({ ...branchFilter(user), imei: normalized, status: 'in_stock' }).lean();
  if (!product) return null;
  const available = getStockQty(product);

  const branch = await Branch.findById(product.branchId).lean();
  return {
    id: String(product._id),
    productId: product.productId ?? String(product._id).slice(-8).toUpperCase(),
    name: product.name,
    imei: product.imei,
    brand: product.brand ?? '',
    deviceModel: product.deviceModel ?? '',
    salePrice: product.salePrice,
    purchasePrice: product.purchasePrice,
    branchId: String(product.branchId),
    branchName: branch?.name ?? '—',
    trackQuantity: product.trackQuantity ?? false,
    available,
  };
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

  const product = await Product.findById(productId);
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

  if (paymentType === 'installment' && !features.variant) {
    return { error: 'Variant (nasiya) moduli yoqilmagan.' };
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
  const saleNo = await generateSaleNo(Sale);

  // To'lov muddati — faqat qarz/nasiya/kredit va qoldiq bo'lsa
  let dueDate: Date | undefined;
  if (remainingAmount > 0 && paymentType !== 'cash') {
    if (dueDateRaw) {
      const d = new Date(dueDateRaw);
      if (!Number.isNaN(d.getTime())) dueDate = d;
    }
    // Nasiya bo'lsa va muddat kiritilmagan bo'lsa — oxirgi oy bo'yicha hisoblaymiz
    if (!dueDate && paymentType === 'installment' && installmentMonths) {
      const d = new Date();
      d.setMonth(d.getMonth() + installmentMonths);
      dueDate = d;
    }
  }

  const payments = paidAmount > 0
    ? [{ amount: paidAmount, paidAt: new Date(), note: paymentType === 'cash' ? 'Naqd to\'lov' : 'Boshlang\'ich to\'lov', recordedBy: user.username }]
    : [];

  try {
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
      dueDate,
      status,
      payments,
      soldBy: user.username,
      notes: notes || undefined,
      photoUrl: photoUrl || undefined,
    });

    if (product.trackQuantity) {
      product.soldQuantity += saleQty;
      product.status = resolveStatusAfterSale(product.trackQuantity, product.quantity, product.soldQuantity);
    } else {
      product.status = 'sold';
    }
    await product.save();

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
    return { error: 'Sotuvda xatolik yuz berdi.' };
  }
}

export async function addSalePaymentAction(_prev: State, formData: FormData): Promise<State> {
  const { user, Sale } = await getTenantSession();

  const saleId = String(formData.get('saleId') || '');
  const amount = parsePrice(String(formData.get('amount') || ''));
  const note = String(formData.get('note') || '').trim();

  if (!saleId) return { error: 'Sotuv topilmadi.' };
  if (amount === null || amount <= 0) return { error: 'To\'lov summasi noto\'g\'ri.' };

  const sale = await Sale.findById(saleId);
  if (!sale) return { error: 'Sotuv topilmadi.' };
  if (sale.status === 'cancelled') return { error: 'Bekor qilingan sotuvga to\'lov qo\'shib bo\'lmaydi.' };
  if (sale.status === 'paid') return { error: 'Bu sotuv allaqachon to\'liq to\'langan.' };
  if (amount > sale.remainingAmount) return { error: `Qoldiq: ${sale.remainingAmount.toLocaleString('uz-UZ')} so'm.` };

  sale.paidAmount += amount;
  sale.remainingAmount = Math.max(0, sale.totalAmount - sale.paidAmount);
  sale.status = calcSaleStatus(sale.totalAmount, sale.paidAmount);
  sale.payments.push({ amount, paidAt: new Date(), note: note || undefined, recordedBy: user.username });
  await sale.save();

  revalidatePath('/app/sales');
  revalidatePath(`/app/sales/${saleId}`);
  revalidatePath('/app');
  return { success: 'To\'lov qo\'shildi.' };
}

export async function cancelSaleAction(_prev: State, formData: FormData): Promise<State> {
  const { Product, Sale } = await getTenantAdminSession();

  const saleId = String(formData.get('saleId') || '');
  if (!saleId) return { error: 'Sotuv topilmadi.' };

  const sale = await Sale.findById(saleId);
  if (!sale) return { error: 'Sotuv topilmadi.' };
  if (sale.status === 'cancelled') return { error: 'Allaqachon bekor qilingan.' };

  sale.status = 'cancelled';
  sale.remainingAmount = 0;
  await sale.save();

  const product = await Product.findById(sale.productId);
  if (product) {
    const saleQty = sale.productSnapshot?.saleQuantity ?? 1;
    if (product.trackQuantity) {
      product.soldQuantity = Math.max(0, product.soldQuantity - saleQty);
      product.status = product.soldQuantity >= product.quantity ? 'sold' : 'in_stock';
    } else if (product.status === 'sold') {
      product.status = 'in_stock';
    }
    await product.save();
  }

  revalidatePath('/app/sales');
  revalidatePath(`/app/sales/${saleId}`);
  revalidatePath('/app/products');
  revalidatePath('/app');
  return { success: 'Sotuv bekor qilindi. Mahsulot omborga qaytdi.' };
}
