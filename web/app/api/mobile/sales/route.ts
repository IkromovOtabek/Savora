import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { authenticateMobile } from '@/lib/mobileAuth';
import { mobilePermissionDenied, userCan } from '@/lib/permissionGuard';
import { permissionDeniedError } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { getTenantModels } from '@/lib/tenantDb';
import { branchFilter } from '@/lib/branchScope';
import { getMobileFeatures } from '@/lib/mobileOrg';
import { generateSaleNo, calcSaleStatus } from '@/lib/sales';
import { parseQtyField } from '@/lib/productQuantity';
import { reserveStock, releaseStock } from '@/lib/stock';
import { parseIntegerSum } from '@/lib/security';
import { addMonthsClamped } from '@/lib/dates';
import { pq294MonthsError } from '@/lib/pq294';

type PaymentType = 'cash' | 'debt' | 'installment' | 'bank_credit';
const PAYMENT_TYPES: PaymentType[] = ['cash', 'debt', 'installment', 'bank_credit'];

/** Matn maydonlari uzunlik chegarasi — oshsa 400 (xotira/DB to'ldirish himoyasi) */
const MAX_LEN = { customerName: 80, customerPhone: 20, bankName: 80, notes: 500 } as const;
const tooLong = (v: string, max: number) => v.length > max;

/**
 * Mobil sotuvlar ro'yxati. Filtr:
 *   ?type=all (default) | debt (qarzdorlik) | installment (nasiya)
 * Qarzdorlik/Nasiya faqat qoldiqli (partial) sotuvlarni beradi.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName) {
    return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  }
  const { Sale } = await getTenantModels(user.dbName);

  const url = new URL(req.url);
  const type = url.searchParams.get('type') || 'all';
  // Sahifa 1..1000 — cheksiz skip() bilan DB'ni qiynamaslik uchun
  const page = Math.min(1000, Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1));
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
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  { const denied = await mobilePermissionDenied(user, 'sale.create'); if (denied) return denied; }

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
  // Butun so'm — kasr/manfiy summalar rad etiladi
  const totalAmount = parseIntegerSum(body.totalAmount) ?? 0;
  const paidAmountParsed = body.paidAmount == null ? 0 : parseIntegerSum(body.paidAmount);
  if (paidAmountParsed === null) return NextResponse.json({ error: 'To\'langan summa noto\'g\'ri.' }, { status: 400 });
  const paidAmountRaw = paidAmountParsed;
  const installmentMonthsRaw = Number(body.installmentMonths) || 0;
  const customerName = String(body.customerName || '').trim();
  const customerPhoneRaw = String(body.customerPhone || '').trim();
  const bankName = String(body.bankName || '').trim();
  const dueDateRaw = String(body.dueDate || '').trim();
  const notes = String(body.notes || '').trim();

  if (tooLong(customerName, MAX_LEN.customerName) || tooLong(customerPhoneRaw, MAX_LEN.customerPhone)
    || tooLong(bankName, MAX_LEN.bankName) || tooLong(notes, MAX_LEN.notes)) {
    return NextResponse.json({ error: 'Matn maydoni juda uzun.' }, { status: 400 });
  }
  // Telefon faqat raqamlar (9–15 ta) — formatlangan kirishlar bir xil mijozga tushadi
  const customerPhone = customerPhoneRaw.replace(/\D/g, '');
  if (customerPhoneRaw && (customerPhone.length < 9 || customerPhone.length > 15)) {
    return NextResponse.json({ error: 'Telefon raqami noto\'g\'ri (9–15 raqam).' }, { status: 400 });
  }

  if (!Types.ObjectId.isValid(productId)) return NextResponse.json({ error: 'Mahsulot tanlanishi shart.' }, { status: 400 });
  if (totalAmount <= 0) return NextResponse.json({ error: 'Sotuv summasi noto\'g\'ri.' }, { status: 400 });

  const { Product, Sale, Customer, CreditBank } = await getTenantModels(user.dbName);
  const product = await Product.findById(productId).lean();
  if (!product || product.status !== 'in_stock') {
    return NextResponse.json({ error: 'Mahsulot omborda emas yoki sotilgan.' }, { status: 400 });
  }
  // Filial-login faqat o'z filialidan sotadi
  if (user.role === 'user' && user.branchId && String(product.branchId) !== String(user.branchId)) {
    return NextResponse.json({ error: 'Bu mahsulot boshqa filialda.' }, { status: 403 });
  }

  const saleQty = product.trackQuantity ? parseQtyField(String(body.saleQty ?? '1')) : 1;
  if (product.trackQuantity) {
    const available = product.quantity - product.soldQuantity;
    if (saleQty > available) return NextResponse.json({ error: `Omborda faqat ${available} ta qoldi.` }, { status: 400 });
  }

  // Sotuv narxidan arzon sotish — "sale.discount" huquqi kerak (web createSaleAction bilan bir xil)
  if (product.salePrice > 0 && totalAmount < product.salePrice * saleQty && !(await userCan(user, 'sale.discount'))) {
    return NextResponse.json(permissionDeniedError('sale.discount'), { status: 403 });
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
    const pqErr = pq294MonthsError(installmentMonths);
    if (pqErr) return NextResponse.json({ error: pqErr }, { status: 400 });
  }

  const remainingAmount = Math.max(0, totalAmount - paidAmount);
  const status = calcSaleStatus(totalAmount, paidAmount);

  let dueDate: Date | undefined;
  if (remainingAmount > 0 && paymentType !== 'cash') {
    if (dueDateRaw) { const d = new Date(dueDateRaw); if (!Number.isNaN(d.getTime())) dueDate = d; }
    if (!dueDate && paymentType === 'installment' && installmentMonths) {
      dueDate = addMonthsClamped(new Date(), installmentMonths);
    }
  }

  const payments = paidAmount > 0
    ? [{ amount: paidAmount, paidAt: new Date(), note: paymentType === 'cash' ? 'Naqd to\'lov' : 'Boshlang\'ich to\'lov', recordedBy: user.username }]
    : [];

  // Mijoz — barcha tekshiruvlar o'tgach yaratiladi (rad etilgan sotuvdan "yetim" mijoz qolmaydi)
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

  // Atomik: qoldiq tekshiruvi + ayirish bitta so'rovda (parallel sotuvda minusga tushmaydi)
  const reserved = await reserveStock(Product, product._id, saleQty, {
    scope: branchFilter(user),
    history: { action: 'sold', detail: `${saleQty} ta`, by: user.username, at: new Date() },
  });
  if (!reserved) {
    return NextResponse.json({ error: 'Mahsulot omborda yetarli emas yoki allaqachon sotilgan.' }, { status: 409 });
  }

  let saleNo: string;
  let sale;
  try {
    saleNo = await generateSaleNo(Sale);
    sale = await Sale.create({
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
  } catch {
    // Kompensatsiya: sotuv yozilmasa — mahsulot omborga qaytadi
    await releaseStock(Product, product._id, saleQty);
    return NextResponse.json({ error: 'Sotuvda xatolik yuz berdi.' }, { status: 500 });
  }

  await recordAudit(user, {
    action: 'sale.create',
    entity: 'sale',
    entityId: String(sale._id),
    summary: `Sotuv ${saleNo}: ${product.name} · ${saleQty} ta · ${totalAmount.toLocaleString('uz-UZ')} so'm (${paymentType}) (mobil)`,
    meta: { saleQty, totalAmount, paymentType },
  });

  return NextResponse.json({ id: String(sale._id), saleNo }, { status: 201 });
}
