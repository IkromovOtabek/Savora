import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { verifyMobileToken } from '@/lib/mobileAuth';
import { getTenantModels } from '@/lib/tenantDb';
import { branchFilter } from '@/lib/branchScope';
import { getMobileFeatures } from '@/lib/mobileOrg';
import { generateSaleNo, calcSaleStatus } from '@/lib/sales';
import { parseQtyField, resolveStatusAfterSale } from '@/lib/productQuantity';

type PaymentType = 'cash' | 'debt' | 'installment' | 'bank_credit';
const PAYMENT_TYPES: PaymentType[] = ['cash', 'debt', 'installment', 'bank_credit'];

/**
 * Mobil sotuvlar ro'yxati. Filtr:
 *   ?type=all (default) | debt (qarzdorlik) | installment (nasiya)
 * Qarzdorlik/Nasiya faqat qoldiqli (partial) sotuvlarni beradi.
 */
export async function GET(req: Request) {
  const user = await verifyMobileToken(req);
  if (!user || !user.dbName) {
    return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  }
  const { Sale } = await getTenantModels(user.dbName);

  const url = new URL(req.url);
  const type = url.searchParams.get('type') || 'all';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const limit = 30;

  const filter: Record<string, unknown> = { ...branchFilter(user), status: { $ne: 'cancelled' } };
  if (type === 'debt') {
    filter.status = 'partial';
    filter.remainingAmount = { $gt: 0 };
  } else if (type === 'installment') {
    filter.paymentType = 'installment';
  }

  const [items, total] = await Promise.all([
    Sale.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Sale.countDocuments(filter),
  ]);

  return NextResponse.json({
    page,
    total,
    hasMore: page * limit < total,
    items: items.map((s) => ({
      id: String(s._id),
      saleNo: s.saleNo,
      product: s.productSnapshot?.name ?? '—',
      customer: s.customerSnapshot?.fullName ?? null,
      phone: s.customerSnapshot?.phone ?? null,
      paymentType: s.paymentType,
      totalAmount: s.totalAmount,
      paidAmount: s.paidAmount,
      remainingAmount: s.remainingAmount,
      installmentMonths: s.installmentMonths ?? null,
      dueDate: s.dueDate ?? null,
      status: s.status,
      createdAt: s.createdAt,
    })),
  });
}

/** Yangi sotuv — naqd / qarz / nasiya / bank krediti. createSaleAction mantiqini takrorlaydi. */
export async function POST(req: Request) {
  const user = await verifyMobileToken(req);
  if (!user || !user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });

  const features = await getMobileFeatures(user.organizationId);
  if (!features) return NextResponse.json({ error: 'Do\'kon topilmadi.' }, { status: 404 });

  let body: {
    productId?: string; paymentType?: string; totalAmount?: number; paidAmount?: number;
    installmentMonths?: number; customerName?: string; customerPhone?: string;
    dueDate?: string; bankName?: string; saleQty?: number | string; notes?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Noto\'g\'ri so\'rov.' }, { status: 400 }); }

  const productId = String(body.productId || '');
  const paymentType = (PAYMENT_TYPES.includes(body.paymentType as PaymentType) ? body.paymentType : 'cash') as PaymentType;
  const totalAmount = Number(body.totalAmount) || 0;
  const paidAmountRaw = Number(body.paidAmount) || 0;
  const installmentMonthsRaw = Number(body.installmentMonths) || 0;
  const customerName = String(body.customerName || '').trim();
  const customerPhone = String(body.customerPhone || '').trim();
  const bankName = String(body.bankName || '').trim();
  const dueDateRaw = String(body.dueDate || '').trim();
  const notes = String(body.notes || '').trim();

  if (!Types.ObjectId.isValid(productId)) return NextResponse.json({ error: 'Mahsulot tanlanishi shart.' }, { status: 400 });
  if (totalAmount <= 0) return NextResponse.json({ error: 'Sotuv summasi noto\'g\'ri.' }, { status: 400 });

  const { Product, Sale, Customer, CreditBank } = await getTenantModels(user.dbName);
  const product = await Product.findById(productId);
  if (!product || product.status !== 'in_stock') {
    return NextResponse.json({ error: 'Mahsulot omborda emas yoki sotilgan.' }, { status: 400 });
  }
  // Filial-login faqat o'z filialidan sotadi
  if (user.branchId && String(product.branchId) !== String(user.branchId)) {
    return NextResponse.json({ error: 'Bu mahsulot boshqa filialda.' }, { status: 403 });
  }

  const saleQty = product.trackQuantity ? parseQtyField(String(body.saleQty ?? '1')) : 1;
  if (product.trackQuantity) {
    const available = product.quantity - product.soldQuantity;
    if (saleQty > available) return NextResponse.json({ error: `Omborda faqat ${available} ta qoldi.` }, { status: 400 });
  }

  let customer: { _id: Types.ObjectId; fullName: string; phone: string } | null = null;
  if (customerName && customerPhone) {
    const found = await Customer.findOne({ phone: customerPhone }).lean();
    if (found) {
      customer = { _id: found._id, fullName: found.fullName, phone: found.phone };
    } else {
      const c = await Customer.create({ fullName: customerName, phone: customerPhone });
      customer = { _id: c._id, fullName: c.fullName, phone: c.phone };
    }
  }

  let paidAmount = paymentType === 'cash' ? totalAmount : paidAmountRaw;
  if (paidAmount > totalAmount) return NextResponse.json({ error: 'To\'langan summa jami summadan oshmasligi kerak.' }, { status: 400 });

  if (paymentType === 'installment' && !features.variant && !features.nasiya) {
    return NextResponse.json({ error: 'Nasiya moduli yoqilmagan.' }, { status: 403 });
  }
  if (paymentType === 'bank_credit') {
    if (!features.creditKassa) return NextResponse.json({ error: 'Kredit kassa moduli yoqilmagan.' }, { status: 403 });
    if (!bankName) return NextResponse.json({ error: 'Bank tanlanishi shart.' }, { status: 400 });
    const bank = await CreditBank.findOne({ name: bankName, active: true }).lean();
    if (!bank) return NextResponse.json({ error: 'Tanlangan bank topilmadi.' }, { status: 400 });
  }

  let installmentMonths: number | undefined;
  if (paymentType === 'installment') {
    installmentMonths = installmentMonthsRaw >= 1 ? Math.min(60, Math.floor(installmentMonthsRaw)) : undefined;
    if (!installmentMonths) return NextResponse.json({ error: 'Nasiya oylari kiritilishi shart (1–60).' }, { status: 400 });
  }

  const remainingAmount = Math.max(0, totalAmount - paidAmount);
  const status = calcSaleStatus(totalAmount, paidAmount);
  const saleNo = await generateSaleNo(Sale);

  let dueDate: Date | undefined;
  if (remainingAmount > 0 && paymentType !== 'cash') {
    if (dueDateRaw) { const d = new Date(dueDateRaw); if (!Number.isNaN(d.getTime())) dueDate = d; }
    if (!dueDate && paymentType === 'installment' && installmentMonths) {
      const d = new Date(); d.setMonth(d.getMonth() + installmentMonths); dueDate = d;
    }
  }

  const payments = paidAmount > 0
    ? [{ amount: paidAmount, paidAt: new Date(), note: paymentType === 'cash' ? 'Naqd to\'lov' : 'Boshlang\'ich to\'lov', recordedBy: user.username }]
    : [];

  const sale = await Sale.create({
    saleNo,
    productId: product._id,
    productSnapshot: { name: product.name, imei: product.imei, brand: product.brand, deviceModel: product.deviceModel, purchasePrice: product.purchasePrice, saleQuantity: saleQty },
    ...(customer ? { customerId: customer._id, customerSnapshot: { fullName: customer.fullName, phone: customer.phone } } : {}),
    branchId: product.branchId,
    paymentType,
    bankName: paymentType === 'bank_credit' ? bankName : undefined,
    totalAmount, paidAmount, remainingAmount, installmentMonths,
    downPayment: paymentType === 'installment' ? paidAmount : undefined,
    dueDate, status, payments, soldBy: user.username, notes: notes || undefined,
  });

  if (product.trackQuantity) {
    product.soldQuantity += saleQty;
    product.status = resolveStatusAfterSale(product.trackQuantity, product.quantity, product.soldQuantity);
  } else {
    product.status = 'sold';
  }
  if (!Array.isArray(product.history)) product.history = [];
  product.history.push({ action: 'sold', detail: `${saleQty} ta`, by: user.username, at: new Date() });
  await product.save();

  return NextResponse.json({ id: String(sale._id), saleNo }, { status: 201 });
}
