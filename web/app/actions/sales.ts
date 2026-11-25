'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Types } from 'mongoose';
import { getTenantSession } from '@/lib/tenantSession';
import { parsePrice } from '@/lib/format';
import { PaymentType, type ISaleBankPart } from '@/lib/models/tenant/Sale';
import { MAX_BANK_DEBT_DAYS, bankPartsLabel } from '@/lib/bankCredit';
import type { ProductUnit } from '@/lib/businessTypes';
import { sendTelegram, tgEscape } from '@/lib/telegram';
import { featureDisabledError } from '@/lib/featureAction';
import { isOwnUploadUrl } from '@/lib/fileUrl';
import { sellableInfo } from '@/lib/productKinds';
import { isFractionalUnit, priceTimesQty, qtyLabel } from '@/lib/qty';
import { releaseStock } from '@/lib/stock';
import { applySalePayment } from '@/lib/salePayment';
import { SALE_CANCEL_CATEGORY } from '@/lib/models/tenant/FinanceCategory';
import { computeInstallmentPlan, installmentPaymentMonths, installmentPaymentNote, spreadShortfall } from '@/lib/installment';
import { recordAudit } from '@/lib/audit';
import { searchSaleCustomers, type SaleCustomerSearch } from '@/lib/saleCustomer';
import { branchFilter } from '@/lib/branchScope';
import { logError } from '@/lib/logger';
import { checkPermission, userCan } from '@/lib/permissionGuard';
import { missingPriceRight, resolveSaleTerms, saleTermsErrorText } from '@/lib/sales/terms';
import { addSalePayment, salePaymentErrorText } from '@/lib/sales/addPayment';
import { afterSales, checkSaleMarking, loadSaleLines, resolveCustomerFor, saleCoreErrorText, writeSales } from '@/lib/sales/createSales';
import { permissionDeniedError } from '@/lib/permissions';
import { getI18n } from '@/lib/i18n/server';
import { qtyWithUnit, tr } from '@/lib/i18n/fmt';
import { computePartialReturn } from '@/lib/saleReturn';
import { SALE_NOTES_MAX, editSale, type SaleEditError, type SaleEditInput } from '@/lib/saleEditOps';
import { z } from 'zod';
import { formToObject, parseInput, zId, zText, zMoney, zInt, zOptInt, zOptQty, zOptDate, zField, zOneOf } from '@/lib/validation';
import { PAY_METHODS } from '@/lib/payMethods';
import { escapeRegExp } from '@/lib/security';
import { scanVariants } from '@/lib/scanCode';
import { splitSale } from '@/lib/saleSplit';
import { newCheckoutId } from '@/lib/receiptLink';
import type { IProduct } from '@/lib/models/tenant/Product';

/** Tez sotuvda bir martada eng ko'p qator (savatcha) — haddan katta so'rovdan himoya */
const QUICK_SALE_MAX_LINES = 100;
/** Sotuv formasida (qarz/kredit) bir xaridda eng ko'p tovar */
const SALE_MAX_LINES = 20;

type State = { error?: string; success?: string; paymentId?: string } | null;

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
  /** Sotuvda nechta bor (xizmat/to'plam uchun — lib/productKinds.ts) */
  sell: { tracked: boolean; available: number },
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
    trackQuantity: sell.tracked,
    unit: product.unit ?? null,
    available: sell.available,
  };
}

export async function lookupProductByImei(imei: string): Promise<ScannedProduct | null> {
  const { user, Product, Branch } = await getTenantSession();
  // Sotuv formasi uchun — «Sotuv qilish» huquqi (o'chiq «Sotuv» modulida huquq ham yo'q)
  if (typeof imei !== 'string' || !(await userCan(user, 'sale.create'))) return null;
  const normalized = normalizeImei(imei);
  if (!normalized) return null;

  let product = await Product.findOne({ ...branchFilter(user), imei: normalized, status: 'in_stock' }).lean();
  // Oxirgi 4+ raqam: faqat bitta telefon mos kelsa — o'sha (bir nechta bo'lsa forma ro'yxatdan tanlatadi)
  if (!product && normalized.length >= 4 && normalized.length < 15) {
    const tail = await Product.find({ ...branchFilter(user), imei: { $regex: `${escapeRegExp(normalized)}$` }, status: 'in_stock' })
      .limit(2)
      .lean();
    if (tail.length === 1) product = tail[0];
  }
  if (!product) return null;

  const branch = await Branch.findById(product.branchId).lean();
  const sell = (await sellableInfo(Product, [product]))(product);
  return toScannedProduct(product, branch?.name ?? '—', await userCan(user, 'product.viewCost'), sell);
}

/** Shtrix, IMEI yoki mahsulot kodi bo'yicha qidiruv (skaner pistalet uchun) */
export async function lookupProductByScan(code: string): Promise<ScannedProduct | null> {
  const { user, Product, Branch } = await getTenantSession();
  if (typeof code !== 'string' || !(await userCan(user, 'sale.create'))) return null;
  const trimmed = code.trim();
  if (!trimmed) return null;

  // Asl ko'rinish va — klaviatura kirill tartibida qolgan bo'lsa — lotinga qaytarilgani (lib/scanCode.ts)
  const variants = scanVariants(trimmed);
  const upper = variants.map((v) => v.toUpperCase());

  const product = await Product.findOne({
    ...branchFilter(user),
    status: 'in_stock',
    $or: [
      { barcode: { $in: [trimmed, ...variants] } },
      { imei: { $in: upper } },
      { productId: { $in: upper } },
    ],
  }).lean();
  if (!product) return null;

  const branch = await Branch.findById(product.branchId).lean();
  const sell = (await sellableInfo(Product, [product]))(product);
  return toScannedProduct(product, branch?.name ?? '—', await userCan(user, 'product.viewCost'), sell);
}

export type QuickSaleLine = { productId: string; qty: number; salePrice?: number };

/** Tez sotuv — bir nechta mahsulotni naqd sotish */
export async function quickSaleBatchAction(items: QuickSaleLine[]): Promise<State> {
  const { user, Product, Sale, ShopSettings, features } = await getTenantSession();
  const { locale, d } = await getI18n();
  const m = d.sales.actions;
  if (!features.sales) return featureDisabledError('sales');
  { const denied = await checkPermission(user, 'sale.create'); if (denied) return denied; }
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

  // Tovarlar (filial doirasi, omborda, miqdor) va narx — lib/sales/createSales (barcha sotuv yo'llari bilan bir yadro)
  const loaded = await loadSaleLines({ Product }, user, lines.map((l) => ({ productId: l.productId, qty: l.qty })));
  if (!loaded.ok) return { error: saleCoreErrorText(loaded.error.code === 'onlyNLeft' ? { code: 'notEnoughStock', name: loaded.error.name } : loaded.error, d) };
  const priced = [];
  for (const [i, pl] of loaded.lines.entries()) {
    const unit = lines[i].salePrice > 0 ? lines[i].salePrice : pl.product.salePrice;
    if (!unit || unit <= 0) return { error: tr(m.enterPriceFor, { name: pl.product.name }) };
    const total = priceTimesQty(unit, pl.qty);
    // Ro'yxat narxidan arzon — sale.discount, qimmat — sale.editPrice (web/mobil bilan bir qoida)
    const right = await missingPriceRight(pl.listTotal, total, pl.product.salePrice > 0, (k) => userCan(user, k));
    if (right) return permissionDeniedError(right);
    priced.push({ ...pl, unit, total });
  }
  const marking = await checkSaleMarking({ Sale, ShopSettings }, priced, []);
  if (!marking.ok) return { error: saleCoreErrorText(marking.error, d) };
  const grand = priced.reduce((sum, p) => sum + p.total, 0);
  const t = await resolveSaleTerms({ paymentType: 'cash', total: grand, lineCount: priced.length, features, locale }, async () => false);
  if (!t.ok) return { error: saleTermsErrorText(t.error, d) };

  const written = await writeSales({ Product, Sale }, user, {
    lines: priced.map((p, i) => ({ ...p, parts: [{ method: 'cash' as const, amount: p.total }], soldUnitPrice: p.unit, marking: marking.lines[i] })),
    terms: t.terms, customer: null,
    productSet: { soldPaymentType: 'cash' },
    stockDetail: (l) => `${qtyLabel(l.qty, l.product.unit)} · ${l.total.toLocaleString('uz-UZ')} so'm`,
  });
  if (!written.ok) return { error: 'error' in written ? saleCoreErrorText(written.error, d) : m.sellFailed };
  const results = written.sales;
  await afterSales(user, results, { terms: t.terms, methods: ['cash'], source: 'quick' });

  // Birliklar aralash bo'lsa (kg + dona) miqdorlarni qo'shib bo'lmaydi — unda qatorlar soni
  const soldCount = results.some((r) => isFractionalUnit(r.product.unit))
    ? results.length
    : results.reduce((sum, r) => sum + r.qty, 0);
  revalidatePath('/app');
  revalidatePath('/app/products');
  revalidatePath('/app/sales');
  return { success: tr(m.quickSold, { n: soldCount, sum: grand.toLocaleString('uz-UZ') }) };
}

/** Sotuv formasidagi F.I.O katagi: mijozlarni real vaqtda qidirish (bo'sh — so'nggi mijozlar) */
export async function searchSaleCustomersAction(q: string): Promise<SaleCustomerSearch> {
  const { user, Customer, features } = await getTenantSession();
  if (!features.sales || !(await userCan(user, 'sale.create'))) return { hits: [], more: false };
  try {
    return await searchSaleCustomers({ Customer }, q);
  } catch (err) {
    logError('sales.searchCustomers', err);
    return { hits: [], more: false };
  }
}

export async function createSaleAction(_prev: State, formData: FormData): Promise<State> {
  const { user, Product, Customer, Sale, CreditBank, ShopSettings, features } = await getTenantSession();
  const { locale, d } = await getI18n();
  const m = d.sales.actions;
  if (!features.sales) return featureDisabledError('sales');
  { const denied = await checkPermission(user, 'sale.create'); if (denied) return denied; }

  const tooLong = d.common.tooLong;
  const parsed = parseInput(z.object({
    // Bir nechta tovar: [{ productId, qty }] (JSON). Eski forma — productId + saleQty
    items: zText(4000, tooLong),
    productId: zText(40),
    // Ro'yxatdan tanlangan mavjud mijoz (bo'lmasa — ism + telefon bo'yicha topiladi yoki ochiladi)
    customerId: zText(40),
    customerName: zText(120, tooLong),
    customerPhone: zText(40, tooLong),
    saleQty: zOptQty(m.badQty),
    paymentType: zField((v) => parsePaymentType(String(v ?? 'cash'))),
    totalAmount: zMoney(m.badTotal, { min: 1 }),
    paidAmount: zMoney(m.badPaid, { optional: true }),
    installmentMonths: zOptInt(m.monthsRequired, 1, 60),
    // Nasiya: har oyning qaysi kuni to'laydi (1–31)
    payDay: zOptInt(m.badPayDay, 1, 31),
    notes: zText(1000, tooLong),
    photoUrl: zText(500, m.badPhotoUrl),
    bankName: zText(120, tooLong),
    // Bir nechta bank: [{ bankName, amount }] (JSON) — lib/bankCredit.ts
    bankParts: zText(4000, tooLong),
    // Bank krediti + nasiya / qarz: qolgan summaning mijoz do'konga to'laydigan qismi
    nasiyaAmount: zMoney(m.badNasiyaPart, { optional: true }),
    // Shu qism muddati: 'months' — oylik nasiya jadvali, 'days' — kun bo'yicha bir martalik qarz
    bankTermUnit: zText(10),
    debtDays: zOptInt(tr(m.debtDaysRequired, { n: MAX_BANK_DEBT_DAYS }), 1, MAX_BANK_DEBT_DAYS),
    dueDate: zOptDate(d.common.invalidInput),
  }), formToObject(formData), d.common.invalidInput);
  if (!parsed.ok) return { error: parsed.error };
  const { customerName, customerPhone, totalAmount, notes, photoUrl, bankName } = parsed.data;
  // Tovar qatorlari: yangi forma — items, eski (bitta tovar) — productId + saleQty
  let rawLines: unknown = [];
  if (parsed.data.items) {
    try { rawLines = JSON.parse(parsed.data.items); } catch { return { error: m.productRequired }; }
  } else if (parsed.data.productId) {
    rawLines = [{ productId: parsed.data.productId, qty: parsed.data.saleQty }];
  }
  const linesParsed = parseInput(
    z.array(z.object({ productId: zId(m.productRequired), qty: zOptQty(m.badQty) }))
      .min(1, m.productRequired)
      .max(SALE_MAX_LINES, tr(m.tooManyItems, { n: SALE_MAX_LINES })),
    rawLines,
    m.productRequired,
  );
  if (!linesParsed.ok) return { error: linesParsed.error };
  const lines = linesParsed.data;
  if (new Set(lines.map((l) => l.productId)).size !== lines.length) return { error: m.duplicateItem };
  const multi = lines.length > 1;

  // Rasm: faqat o'zimizning storage URL'i + «Rasm/kamera» moduli yoqilgan bo'lsa
  if (photoUrl) {
    if (!features.mediaUpload) return featureDisabledError('mediaUpload');
    if (!isOwnUploadUrl(photoUrl)) return { error: m.badPhotoUrl };
  }

  // Tovarlar (filial doirasi, omborda, miqdor) — lib/sales/createSales (mobil bilan bir yadro)
  const loaded = await loadSaleLines({ Product }, user, lines);
  if (!loaded.ok) return { error: saleCoreErrorText(loaded.error, d) };
  const prepared = loaded.lines;
  // Ko'p tovarda jami narxlarga mutanosib bo'linadi — har birining narxi bo'lishi kerak
  if (multi) {
    const noPrice = prepared.find((p) => !(p.product.salePrice > 0));
    if (noPrice) return { error: tr(m.enterPriceFor, { name: noPrice.product.name }) };
  }
  const listTotal = prepared.reduce((s, p) => s + p.listTotal, 0);
  const priced = prepared.every((p) => p.product.salePrice > 0);
  // Ro'yxat narxidan arzon — sale.discount, qimmat — sale.editPrice (lib/sales/terms — mobil bilan bir qoida)
  const right = await missingPriceRight(listTotal, totalAmount, priced, (k) => userCan(user, k));
  if (right) return permissionDeniedError(right);

  // To'lov shartlari: nasiya, bank krediti (+ mijoz qismi), muddat — lib/sales/terms (mobil bilan bir qoida)
  const t = await resolveSaleTerms({
    paymentType: parsed.data.paymentType, total: totalAmount, paid: parsed.data.paidAmount, lineCount: lines.length,
    months: parsed.data.installmentMonths, payDay: parsed.data.payDay, dueDate: parsed.data.dueDate,
    bankParts: parsed.data.bankParts, bankName, nasiyaAmount: parsed.data.nasiyaAmount, bankTermUnit: parsed.data.bankTermUnit,
    debtDays: parsed.data.debtDays, features, locale,
  }, async (names) => (await CreditBank.countDocuments({ name: { $in: names }, active: true })) === names.length);
  if (!t.ok) return { error: saleTermsErrorText(t.error, d) };
  const { paymentType, paid: paidAmount, bankParts, bankNasiya, months: installmentMonths, payDay, dueDate } = t.terms;
  const bankLabel = bankParts ? bankPartsLabel(bankParts) : '';

  // Mijoz: qarz/nasiya/bankda majburiy, naqdda ixtiyoriy (lib/sales/createSales)
  const cust = await resolveCustomerFor({ Customer }, { customerId: parsed.data.customerId, name: customerName, phone: customerPhone }, paymentType !== 'cash');
  if (!cust.ok) return { error: saleCoreErrorText(cust.error, d) };
  // Markirovka: do'kon «majburiy» rejimida markirovkali tovar kodsiz sotilmaydi (kod — Kassa/POS skaneri)
  const marking = await checkSaleMarking({ Sale, ShopSettings }, prepared, []);
  if (!marking.ok) return { error: saleCoreErrorText(marking.error, d) };

  // Qatorlar: jami, bosh to'lov va bank ulushlari aniq taqsimlanadi (lib/saleSplit.ts).
  // Har qator — alohida sotuv, bitta xarid (checkoutId) bilan bog'langan (POS'dagi kabi).
  const split = multi
    ? splitSale({ listTotals: prepared.map((p) => p.listTotal), total: totalAmount, paid: paidAmount, bankParts })
    : [{ total: totalAmount, paid: paidAmount, bankParts }];
  const checkoutId = multi ? newCheckoutId() : undefined;
  const written = await writeSales({ Product, Sale }, user, {
    lines: prepared.map((p, i) => ({ ...p, total: split[i].total, parts: [{ method: 'cash' as const, amount: split[i].paid }], bankParts: split[i].bankParts, marking: marking.lines[i] })),
    terms: t.terms, customer: cust.customer, checkoutId, notes, photoUrl,
  });
  if (!written.ok) return { error: 'error' in written ? saleCoreErrorText(written.error, d) : m.saleFailed };
  const results = written.sales;
  await afterSales(user, results, { terms: t.terms, methods: ['cash'], source: 'web', checkoutId });

  const saleNos = results.map((r) => r.saleNo).sort();
  const noLabel = saleNos.length > 1 ? `${saleNos[0]} – ${saleNos[saleNos.length - 1]}` : saleNos[0];
  void sendTelegram(
    `<b>Savora — Yangi sotuv</b>\n` +
    `${tgEscape(noLabel)} · ${results.map((r) => `${tgEscape(r.product.name)} (${qtyLabel(r.qty, r.product.unit)})`).join(', ')}\n` +
    `Mijoz: ${tgEscape(cust.customer?.fullName ?? '—')}\n` +
    `Summa: ${totalAmount.toLocaleString('uz-UZ')} so'm\n` +
    `To'lov: ${tgEscape(paymentType)}${bankLabel ? ` (${tgEscape(bankLabel)})` : ''}`,
  );

  revalidatePath('/app');
  revalidatePath('/app/sales');
  revalidatePath('/app/products');
  if (bankParts) revalidatePath('/app/kredit-kassa');
  if (paymentType === 'installment') revalidatePath('/app/nasiya');
  if (paymentType === 'debt' || bankNasiya) revalidatePath('/app/debts');
  redirect(`/app/sales/${results[0].saleId}?created=1`);
}

export async function addSalePaymentAction(_prev: State, formData: FormData): Promise<State> {
  const { user, Sale } = await getTenantSession();
  const m = (await getI18n()).d.sales.actions;
  { const denied = await checkPermission(user, 'payment.accept'); if (denied) return denied; }

  const parsed = parseInput(z.object({
    saleId: zId(m.saleNotFound),
    amount: zMoney(m.badPaymentAmount, { min: 1 }),
    method: zOneOf(PAY_METHODS, m.badPayMethod),
    note: zText(300, (await getI18n()).d.common.tooLong),
    // Nasiya qisman to'lovi: oydan yetmagani keyingi oylarga bo'linsinmi ("1")
    spread: zText(4),
  }), formToObject(formData), m.badPaymentAmount);
  if (!parsed.ok) return { error: parsed.error };
  const { saleId, amount, method, note } = parsed.data;

  // To'lov — lib/sales/addPayment (mobil va ommaviy to'lov bilan bir yadro)
  const r = await addSalePayment({ Sale }, user, { saleId, amount, method, note, spread: parsed.data.spread === '1', source: 'web' });
  if (!r.ok) return { error: salePaymentErrorText(r.error, (await getI18n()).d) };
  const res = r.done;

  revalidatePath('/app/sales');
  revalidatePath(`/app/sales/${saleId}`);
  revalidatePath('/app/nasiya');
  revalidatePath('/app/debts');
  revalidatePath('/app');
  // paymentId — to'lov cheki (/app/sales/[id]/payment/[paymentId])
  return { success: m.paymentAdded, paymentId: res.paymentId };
}

export async function cancelSaleAction(_prev: State, formData: FormData): Promise<State> {
  // Admin — doim; filial login — faqat "sale.cancel" huquqi bo'lsa va faqat o'z filiali sotuvini
  const { user, Product, Sale, CashFlow, CashShift, FinanceCategory } = await getTenantSession();
  const m = (await getI18n()).d.sales.actions;
  { const denied = await checkPermission(user, 'sale.cancel'); if (denied) return denied; }

  const parsed = parseInput(zId(m.saleNotFound), formData.get('saleId'));
  if (!parsed.ok) return { error: parsed.error };
  const saleId = parsed.data;

  // Idempotent: faqat bekor qilinmagan sotuv bir marta "cancelled" ga o'tadi —
  // ikki marta bosilsa ham mahsulot omborga ikki marta qaytmaydi, pul ikki marta chiqmaydi.
  // cancelledAt — yangi tartib belgisi: to'lovlar kassada realizatsiya bo'lib qoladi (lib/kassa).
  const scope = branchFilter(user);
  const cancelledAt = new Date();
  const sale = await Sale.findOneAndUpdate(
    { _id: saleId, ...scope, status: { $ne: 'cancelled' } },
    { $set: { status: 'cancelled', remainingAmount: 0, cancelledAt, cancelledBy: user.username } },
    { new: false }
  ).lean();
  if (!sale) {
    const exists = await Sale.exists({ _id: saleId, ...scope });
    return { error: exists ? m.alreadyCancelled : m.saleNotFound };
  }

  // To'langan pul (qisman qaytarishda qaytgani ayirilgan) mijozga naqd qaytariladi —
  // Moliya'da «Sotuv bekor qilindi» chiqimi: Hisoblar holati, smena va kirim-chiqimda kassadan ayiriladi
  const refund = Math.max(0, sale.paidAmount);
  await Sale.updateOne({ _id: sale._id }, { $set: { cancelRefund: refund } });
  if (refund > 0) {
    try {
      await FinanceCategory.updateOne(
        { type: 'expense', name: SALE_CANCEL_CATEGORY },
        { $setOnInsert: { system: true, active: true } },
        { upsert: true },
      ).catch(() => { /* parallel upsert — unikal indeks */ });
      const shift = await CashShift.findOne({ branchId: sale.branchId, status: 'open' }).select('_id').lean();
      const customer = sale.customerSnapshot?.fullName;
      await CashFlow.create({
        type: 'expense',
        amount: refund,
        description: `${sale.saleNo} bekor qilindi — mijozga qaytarildi: ${sale.productSnapshot?.name ?? ''}${customer ? `, ${customer}` : ''}`.slice(0, 300),
        category: SALE_CANCEL_CATEGORY,
        branchId: sale.branchId,
        ...(shift ? { shiftId: shift._id } : {}),
        saleId: sale._id,
        recordedBy: user.username,
      });
    } catch (err) {
      // Sotuv bekor bo'ldi, lekin chiqim yozilmadi — audit/logda ko'rinadi, qo'lda kiritiladi
      logError('cancelSaleAction refund cashflow failed', err, { user: user.username, dbName: user.dbName, saleNo: sale.saleNo });
    }
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
    summary: `Sotuv bekor qilindi: ${sale.saleNo} · ${sale.productSnapshot?.name ?? ''} · ${sale.totalAmount.toLocaleString('uz-UZ')} so'm`
      + (refund > 0 ? ` · mijozga qaytarildi ${refund.toLocaleString('uz-UZ')} so'm (kassadan chiqim)` : ''),
    meta: { paidAmount: sale.paidAmount, paymentType: sale.paymentType, totalAmount: sale.totalAmount, refund },
  });

  revalidatePath('/app/sales');
  revalidatePath(`/app/sales/${saleId}`);
  revalidatePath('/app/products');
  revalidatePath('/app/finance');
  revalidatePath('/app/kassa');
  revalidatePath('/app');
  return { success: refund > 0 ? tr(m.saleCancelledRefund, { sum: refund.toLocaleString('uz-UZ') }) : m.saleCancelled };
}

/**
 * Qisman qaytarish — sotuvdan bir necha dona omborga qaytadi, summa kamayadi.
 * Avval qarz kamayadi, ortig'i mijozga naqd qaytariladi (kunlik kassada chiqim bo'lib ko'rinadi).
 * Huquq: "sale.return" (eski ro'yxatlarda "sale.cancel" dan meros — lib/permissions legacy).
 */
export async function returnSaleItemsAction(_prev: State, formData: FormData): Promise<State> {
  const { user, Product, Sale } = await getTenantSession();
  const { d } = await getI18n();
  const m = d.sales.actions;
  { const denied = await checkPermission(user, 'sale.return'); if (denied) return denied; }

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
    bankParts: sale.bankParts,
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

/**
 * Sotuvni tahrirlash — mijoz, izoh, qarz muddati, narx (lib/saleEditOps).
 * Huquq: «sale.edit»; narx uchun qo'shimcha «sale.editPrice». Forma faqat ko'rsatilgan maydonlarni yuboradi
 * (`customerOn` / `dueOn` / `totalAmount` bo'lmasa — o'sha maydon o'zgarmaydi).
 */
export async function editSaleAction(_prev: State, formData: FormData): Promise<State> {
  const { user, Sale, Customer } = await getTenantSession();
  const { d } = await getI18n();
  const m = d.sales.actions;
  { const denied = await checkPermission(user, 'sale.edit'); if (denied) return denied; }

  const parsed = parseInput(z.object({
    saleId: zId(m.saleNotFound),
    customerOn: zText(1),
    customerId: zText(40),
    customerName: zText(80, m.nameTooLong80),
    customerPhone: zText(20, m.badPhone),
    notes: zText(SALE_NOTES_MAX, d.common.tooLong),
    dueOn: zText(1),
    dueDate: zOptDate(m.badDate),
    totalAmount: zText(20),
  }), formToObject(formData), m.saleNotFound);
  if (!parsed.ok) return { error: parsed.error };
  const f = parsed.data;

  const input: SaleEditInput = { notes: formData.has('notes') ? f.notes : undefined };
  if (f.customerOn === '1') {
    input.customer = f.customerId || f.customerName.trim() || f.customerPhone.trim()
      ? { id: f.customerId || undefined, name: f.customerName, phone: f.customerPhone }
      : null;
  }
  if (f.dueOn === '1') input.dueDate = f.dueDate ?? null;
  if (formData.has('totalAmount')) {
    const n = Number(f.totalAmount.replace(/\s/g, ''));
    if (!f.totalAmount.trim() || !Number.isSafeInteger(n)) return { error: m.editBadAmount };
    input.totalAmount = n;
  }

  const res = await editSale({ Sale, Customer }, user, f.saleId, input, { canEditPrice: await userCan(user, 'sale.editPrice') });
  if (!res.ok) {
    if (res.error === 'pricePerm') return permissionDeniedError('sale.editPrice');
    const err: Record<Exclude<SaleEditError, 'pricePerm'>, string> = {
      notFound: m.saleNotFound,
      cancelled: m.editCancelled,
      bankCredit: m.editBankCredit,
      badAmount: m.editBadAmount,
      belowDown: m.editBelowDown,
      noChanges: m.editNoChanges,
      conflict: m.returnConflict,
      customerRequired: m.editCustomerRequired,
      dueNotAllowed: m.editDueNotAllowed,
      badDate: m.badDate,
      nameRequired: m.nameRequired,
      phoneRequired: m.phoneRequired,
      badPhone: m.badPhone,
    };
    return { error: err[res.error] };
  }

  revalidatePath('/app/sales');
  revalidatePath(`/app/sales/${f.saleId}`);
  if (res.price) {
    revalidatePath('/app/kassa');
    revalidatePath('/app/debts');
    revalidatePath('/app/nasiya');
    revalidatePath('/app');
  }
  const p = res.price;
  return {
    success: p && p.refundAmount > 0 ? tr(m.editedRefund, { sum: p.refundAmount.toLocaleString('uz-UZ') })
      : p && p.newRemaining > 0 ? tr(m.editedRemaining, { sum: p.newRemaining.toLocaleString('uz-UZ') })
      : m.edited,
  };
}
