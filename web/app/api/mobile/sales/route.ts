import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { authenticateMobile } from '@/lib/mobileAuth';
import { mobilePermissionDenied, userCan } from '@/lib/permissionGuard';
import { permissionDeniedError } from '@/lib/permissions';
import { getTenantModels } from '@/lib/tenantDb';
import { branchFilter } from '@/lib/branchScope';
import { getMobileFeatures } from '@/lib/mobileOrg';
import { parseQty } from '@/lib/qty';
import { splitSale } from '@/lib/saleSplit';
import { parseIntegerSum } from '@/lib/security';
import { missingPriceRight, resolveSaleTerms, saleTermsErrorText } from '@/lib/sales/terms';
import { afterSales, checkSaleMarking, loadSaleLines, resolveCustomerFor, saleCoreErrorText, writeSales, type SaleCoreError } from '@/lib/sales/createSales';
import { getDictionary } from '@/lib/i18n/dict';
import { isPayMethod, type PayMethod } from '@/lib/payMethods';
import { newCheckoutId, receiptPath } from '@/lib/receiptLink';
import { isClientSaleId } from '@/lib/posSync';
import { saleSearchFilter } from '@/lib/saleSearch';
import type { SessionUser } from '@/lib/session';

type SaleModel = Awaited<ReturnType<typeof getTenantModels>>['Sale'];

/**
 * Shu kalit bilan allaqachon yozilgan sotuv — qayta yuborishda o'sha javob qaytadi, yangi sotuv yozilmaydi.
 * Kalit boshqa xodimniki bo'lsa — 409 (boshqa sotuv ma'lumoti ko'rsatilmaydi).
 */
async function existingSaleResponse(Sale: SaleModel, clientSaleId: string, user: SessionUser): Promise<NextResponse | null> {
  const prev = await Sale.findOne(
    { clientSaleId },
    { _id: 1, saleNo: 1, totalAmount: 1, remainingAmount: 1, checkoutId: 1, soldBy: 1 },
  ).lean();
  if (!prev) return null;
  if (prev.soldBy !== user.username) return NextResponse.json({ error: 'Sotuv kaliti band.' }, { status: 409 });
  // Savat: kalit birinchi qatorda — jami butun xarid (checkoutId) bo'yicha
  const all = prev.checkoutId
    ? await Sale.find({ checkoutId: prev.checkoutId }, { totalAmount: 1, remainingAmount: 1 }).lean()
    : [prev];
  return NextResponse.json({
    id: String(prev._id), saleNo: prev.saleNo,
    totalAmount: all.reduce((a, x) => a + x.totalAmount, 0), remainingAmount: all.reduce((a, x) => a + x.remainingAmount, 0), items: all.length,
    receiptPath: user.organizationId && prev.checkoutId ? receiptPath(user.organizationId, prev.checkoutId) : null,
  }, { status: 200 });
}

type PaymentType = 'cash' | 'debt' | 'installment' | 'bank_credit';
const PAYMENT_TYPES: PaymentType[] = ['cash', 'debt', 'installment', 'bank_credit'];

/** Matn maydonlari uzunlik chegarasi — oshsa 400 (xotira/DB to'ldirish himoyasi) */
const MAX_LEN = { customerName: 80, customerPhone: 20, bankName: 80, notes: 500 } as const;
const tooLong = (v: string, max: number) => v.length > max;
/** Savatda ko'pi bilan shuncha tovar (web «Yangi sotuv» SALE_MAX_LINES bilan bir xil) */
const MAX_ITEMS = 20;

/**
 * Mobil sotuvlar ro'yxati. Filtr:
 *   ?type=all (default) | debt (qarzdorlik) | installment (nasiya); ?q= — qidiruv (lib/saleSearch)
 * Qarzdorlik/Nasiya faqat qoldiqli (partial) sotuvlarni beradi.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName) {
    return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  }
  { const denied = await mobilePermissionDenied(user, 'sales.view'); if (denied) return denied; }
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
    filter.paymentType = { $ne: 'bank_credit' }; // bank qarzi — Kredit kassada
  } else if (type === 'installment') {
    filter.paymentType = 'installment';
  }
  // ?q= — mahsulot, mijoz (ism/telefon), sotuv raqami, IMEI (web ro'yxati bilan bir xil; eski ilova yubormaydi)
  const qf = saleSearchFilter(url.searchParams.get('q'));
  if (qf) filter.$and = [qf];

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

/**
 * Yangi sotuv — naqd / qarz / nasiya / bank krediti. createSaleAction mantiqini takrorlaydi.
 * Bank krediti + mijoz qismi (`nasiyaAmount`): muddat oyda — «Nasiya» (oylik jadval), kunda (`bankTermUnit: 'days'`,
 * `debtDays`) — «Qarz»; bank ulushlari bankParts'da (Kredit kassa), remainingAmount — faqat mijoz qismi.
 */
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
    /** F.I.O takliflaridan tanlangan mavjud mijoz (GET /api/mobile/customers); eski ilova yubormaydi */
    customerId?: unknown;
    /** Nasiya: har oyning qaysi kuni to'laydi (1–31); eski ilova yubormaydi — sotuv sanasi + N oy */
    payDay?: number | string;
    dueDate?: string; bankName?: string; saleQty?: number | string; notes?: string;
    /** Bir nechta bank: [{ bankName, amount }] — yo'q bo'lsa bankName ga qolgan summa to'liq */
    bankParts?: unknown;
    /** Bank krediti + nasiya / qarz: qolgan summaning mijoz do'konga to'laydigan qismi (eski ilova yubormaydi) */
    nasiyaAmount?: unknown;
    /** Mijoz qismi muddati: 'months' — oylik nasiya (installmentMonths), 'days' — bir martalik qarz (debtDays) */
    bankTermUnit?: unknown;
    debtDays?: unknown;
    /** To'langan qism usuli: cash | uzcard | humo | click | payme (eski ilova yubormaydi — naqd) */
    payMethod?: string;
    /**
     * Qurilma bergan sotuv kaliti (ixtiyoriy; eski ilova yubormaydi). Javob kelmay qolsa (timeout) ilova
     * shu kalit bilan qayta yuboradi yoki oflayn navbatga qo'yadi — sotuv ikki marta yozilmaydi
     * (pos/sync bilan umumiy unikal indeks).
     */
    clientSaleId?: unknown;
    /** Savat (mobil 1.7+): bir nechta tovar [{ productId, qty }] — naqd/qarz; jami narxlarga mutanosib bo'linadi */
    items?: unknown;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Noto\'g\'ri so\'rov.' }, { status: 400 }); }

  const clientSaleId = body.clientSaleId == null || body.clientSaleId === '' ? undefined : body.clientSaleId;
  if (clientSaleId !== undefined && !isClientSaleId(clientSaleId)) {
    return NextResponse.json({ error: 'Sotuv kaliti noto\'g\'ri.' }, { status: 400 });
  }

  const productId = String(body.productId || '');
  const requestedType = (PAYMENT_TYPES.includes(body.paymentType as PaymentType) ? body.paymentType : 'cash') as PaymentType;
  const nasiyaParsed = requestedType === 'bank_credit' && body.nasiyaAmount != null && body.nasiyaAmount !== ''
    ? parseIntegerSum(body.nasiyaAmount) : 0;
  if (nasiyaParsed === null) return NextResponse.json({ error: 'Mijoz qismi summasi noto\'g\'ri.' }, { status: 400 });
  // Qarz/nasiya/kredit (bank + mijoz qismi ham) — mijozsiz bo'lmaydi
  const needsCustomer = requestedType !== 'cash';
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
  if (body.payMethod != null && !isPayMethod(body.payMethod)) return NextResponse.json({ error: 'To\'lov usuli noto\'g\'ri.' }, { status: 400 });
  const payMethod: PayMethod = isPayMethod(body.payMethod) ? body.payMethod : 'cash';

  if (tooLong(customerName, MAX_LEN.customerName) || tooLong(customerPhoneRaw, MAX_LEN.customerPhone)
    || tooLong(bankName, MAX_LEN.bankName) || tooLong(notes, MAX_LEN.notes)) {
    return NextResponse.json({ error: 'Matn maydoni juda uzun.' }, { status: 400 });
  }
  // Telefon faqat raqamlar (9–15 ta) — formatlangan kirishlar bir xil mijozga tushadi
  const customerPhone = customerPhoneRaw.replace(/\D/g, '');
  if (customerPhoneRaw && (customerPhone.length < 9 || customerPhone.length > 15)) {
    return NextResponse.json({ error: 'Telefon raqami noto\'g\'ri (9–15 raqam).' }, { status: 400 });
  }
  const customerId = typeof body.customerId === 'string' && Types.ObjectId.isValid(body.customerId) ? body.customerId : '';
  // Qarz/nasiya/kredit — mijozsiz bo'lmaydi. Naqdda yangi ilova mijozni o'zi talab qiladi; server talab qilmaydi —
  // eski ilovalar (1.3.0, OTA'siz 1.6.0) naqdni mijozsiz yuboradi va ular sotolmay qolmasin
  if (needsCustomer && !customerId && (!customerName || !customerPhone)) {
    return NextResponse.json({ error: 'Mijoz ismi va telefoni kiritilishi shart.' }, { status: 400 });
  }

  // Tovar qatorlari: savat (items) yoki eski bitta tovar (productId + saleQty). Miqdor "1,5" ham —
  // birlikka mosligi (dona — butun) yadroda tekshiriladi
  const rawItems = Array.isArray(body.items) ? body.items : null;
  if (rawItems && (rawItems.length < 1 || rawItems.length > MAX_ITEMS)) return NextResponse.json({ error: 'Tovarlar soni noto\'g\'ri.' }, { status: 400 });
  const reqLines: { productId: string; qty?: number | null }[] = rawItems
    ? rawItems.map((it) => {
      const o = (it ?? {}) as { productId?: unknown; qty?: unknown };
      return { productId: String(o.productId ?? ''), qty: o.qty == null || o.qty === '' ? undefined : parseQty(o.qty as string | number, 'kg') };
    })
    : [{ productId, qty: body.saleQty == null || body.saleQty === '' ? undefined : parseQty(body.saleQty, 'kg') }];
  if (reqLines.some((l) => !Types.ObjectId.isValid(l.productId))) return NextResponse.json({ error: 'Mahsulot tanlanishi shart.' }, { status: 400 });
  if (new Set(reqLines.map((l) => l.productId)).size !== reqLines.length) return NextResponse.json({ error: 'Bir tovar ikki marta qo\'shilgan.' }, { status: 400 });
  if (totalAmount <= 0) return NextResponse.json({ error: 'Sotuv summasi noto\'g\'ri.' }, { status: 400 });

  const { Product, Sale, Customer, CreditBank, ShopSettings } = await getTenantModels(user.dbName);
  // Qayta yuborish: sotuv birinchi so'rovda yozilgan (mahsulot endi "sotilgan" bo'lishi mumkin) — o'sha javob
  if (clientSaleId) {
    const prev = await existingSaleResponse(Sale, clientSaleId, user);
    if (prev) return prev;
  }
  // Tovar (filial doirasi, omborda, miqdor) — lib/sales/createSales (web «Yangi sotuv» bilan bir yadro).
  // Miqdor: "1,5" ham; birlikka mosligi (dona — butun) yadroda tekshiriladi
  const d = getDictionary('uz');
  const fail = (e: SaleCoreError, status = 400) => NextResponse.json({ error: saleCoreErrorText(e, d) }, { status });
  if (reqLines.some((l) => l.qty === null)) return fail({ code: 'badQty' });
  const loaded = await loadSaleLines({ Product }, user, reqLines.map((l) => ({ productId: l.productId, qty: l.qty ?? undefined })));
  if (!loaded.ok) return fail(loaded.error);
  const lines = loaded.lines;
  const multi = lines.length > 1;
  // Ko'p tovarda jami narxlarga mutanosib bo'linadi — har birining narxi bo'lishi kerak (web bilan bir xil)
  const noPrice = multi ? lines.find((l) => !(l.product.salePrice > 0)) : undefined;
  if (noPrice) return fail({ code: 'enterPriceFor', name: noPrice.product.name });
  const listTotal = lines.reduce((a, l) => a + l.listTotal, 0);

  // Narx huquqi va to'lov shartlari — lib/sales/terms (web «Yangi sotuv» bilan bir qoida)
  const right = await missingPriceRight(listTotal, totalAmount, lines.every((l) => l.product.salePrice > 0), (k) => userCan(user, k));
  if (right) return NextResponse.json(permissionDeniedError(right), { status: 403 });
  const dueParsed = dueDateRaw ? new Date(dueDateRaw) : undefined;
  const t = await resolveSaleTerms({
    paymentType: requestedType, total: totalAmount, paid: paidAmountRaw, lineCount: lines.length,
    months: installmentMonthsRaw, payDay: body.payDay, dueDate: dueParsed && !Number.isNaN(dueParsed.getTime()) ? dueParsed : undefined,
    bankParts: body.bankParts, bankName, nasiyaAmount: nasiyaParsed, bankTermUnit: body.bankTermUnit,
    debtDays: Number(body.debtDays), features,
  }, async (names) => (await CreditBank.countDocuments({ name: { $in: names }, active: true })) === names.length);
  if (!t.ok) {
    const status = t.error.code === 'nasiyaDisabled' || t.error.code === 'creditKassaDisabled' ? 403 : 400;
    return NextResponse.json({ error: saleTermsErrorText(t.error, d) }, { status });
  }

  // Mijoz — barcha tekshiruvlar o'tgach (rad etilgan sotuvdan "yetim" mijoz qolmaydi); naqdda ixtiyoriy
  const cust = await resolveCustomerFor({ Customer }, { customerId, name: customerName, phone: customerPhone }, t.terms.paymentType !== 'cash');
  if (!cust.ok) return fail(cust.error);
  // Markirovka: do'kon «majburiy» rejimida markirovkali tovar kodsiz sotilmaydi
  const marking = await checkSaleMarking({ Sale, ShopSettings }, lines, []);
  if (!marking.ok) return fail(marking.error);

  // Qatorlar: jami, bosh to'lov va bank ulushlari aniq taqsimlanadi (lib/saleSplit — web bilan bir xil)
  const split = multi
    ? splitSale({ listTotals: lines.map((l) => l.listTotal), total: totalAmount, paid: t.terms.paid, bankParts: t.terms.bankParts })
    : [{ total: totalAmount, paid: t.terms.paid, bankParts: t.terms.bankParts }];
  const checkoutId = newCheckoutId();
  const written = await writeSales({ Product, Sale }, user, {
    lines: lines.map((l, i) => ({ ...l, total: split[i].total, parts: [{ method: payMethod, amount: split[i].paid }], bankParts: split[i].bankParts, marking: marking.lines[i] })),
    terms: t.terms, customer: cust.customer, checkoutId, clientSaleId: clientSaleId as string | undefined, notes,
  });
  if (!written.ok) {
    // Parallel so'rov (yoki oflayn sinxron) shu kalit bilan allaqachon yozgan — o'sha sotuv qaytadi
    if ('duplicate' in written && clientSaleId) {
      const prev = await existingSaleResponse(Sale, clientSaleId, user);
      if (prev) return prev;
    }
    if ('error' in written) return fail(written.error, written.error.code === 'notEnoughStock' ? 409 : 500);
    return fail({ code: 'failed' }, 500);
  }
  const sale = written.sales[0];
  await afterSales(user, written.sales, { terms: t.terms, methods: [payMethod], source: 'mobile', checkoutId });

  return NextResponse.json({
    id: sale.saleId, saleNo: sale.saleNo, totalAmount, remainingAmount: written.sales.reduce((a, x) => a + x.remaining, 0),
    items: written.sales.length,
    // Mijozga ulashiladigan ochiq chek (login talab qilmaydi)
    receiptPath: user.organizationId ? receiptPath(user.organizationId, checkoutId) : null,
  }, { status: 201 });
}
