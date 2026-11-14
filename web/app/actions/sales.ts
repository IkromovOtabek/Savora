'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Types } from 'mongoose';
import { getTenantSession } from '@/lib/tenantSession';
import { parsePrice } from '@/lib/format';
import { calcSaleStatus, generateSaleNo } from '@/lib/sales';
import { PaymentType, type ISaleBankPart } from '@/lib/models/tenant/Sale';
import { MAX_BANK_PARTS, bankPartsLabel, parseBankPartsInput, validateBankParts } from '@/lib/bankCredit';
import type { ProductUnit } from '@/lib/businessTypes';
import { sendTelegram, tgEscape } from '@/lib/telegram';
import { notifyNewSale, salePayLabel } from '@/lib/shopNotify';
import { featureDisabledError } from '@/lib/featureAction';
import { isOwnUploadUrl } from '@/lib/fileUrl';
import { checkSaleQty } from '@/lib/productQuantity';
import { sellableInfo } from '@/lib/productKinds';
import { isFractionalUnit, priceTimesQty, qtyLabel } from '@/lib/qty';
import { reserveStock, releaseStock } from '@/lib/stock';
import { runWithCompensation } from '@/lib/compensate';
import { addMonthsClamped } from '@/lib/dates';
import { applySalePayment } from '@/lib/salePayment';
import { computeInstallmentPlan, installmentPaymentNote } from '@/lib/installment';
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
import { formToObject, parseInput, zId, zText, zMoney, zInt, zOptInt, zOptQty, zOptDate, zField, zOneOf } from '@/lib/validation';
import { PAY_METHODS } from '@/lib/payMethods';
import { escapeRegExp } from '@/lib/security';
import { splitSale } from '@/lib/saleSplit';
import { newCheckoutId } from '@/lib/receiptLink';
import type { IProduct } from '@/lib/models/tenant/Product';

/** Tez sotuvda bir martada eng ko'p qator (savatcha) — haddan katta so'rovdan himoya */
const QUICK_SALE_MAX_LINES = 100;
/** Sotuv formasida (qarz/kredit) bir xaridda eng ko'p tovar */
const SALE_MAX_LINES = 20;

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
  const sell = (await sellableInfo(Product, [product]))(product);
  return toScannedProduct(product, branch?.name ?? '—', await userCan(user, 'product.viewCost'), sell);
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
  void notifyNewSale(user, {
    items: outcome.results.length, firstItem: outcome.results[0]?.name ?? '—', total: soldTotal,
    payment: salePayLabel('cash'), by: user.username,
  });

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
    // Bir nechta tovar: [{ productId, qty }] (JSON). Eski forma — productId + saleQty
    items: zText(4000, tooLong),
    productId: zText(40),
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
    // Bir nechta bank: [{ bankName, amount }] (JSON) — lib/bankCredit.ts
    bankParts: zText(4000, tooLong),
    dueDate: zOptDate(d.common.invalidInput),
  }), formToObject(formData), d.common.invalidInput);
  if (!parsed.ok) return { error: parsed.error };
  const { customerName, customerPhone, totalAmount, notes, photoUrl, bankName } = parsed.data;
  const paymentType = parsed.data.paymentType;
  const paidAmountRaw = parsed.data.paidAmount;
  const installmentMonthsRaw = parsed.data.installmentMonths ?? 0;

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
  // Nasiya — har tovar o'z oylik jadvali bilan; hozircha bitta tovar (bank krediti/qarz — ko'p tovar)
  if (paymentType === 'installment' && multi) return { error: m.installmentOneItem };

  // Rasm: faqat o'zimizning storage URL'i + «Rasm/kamera» moduli yoqilgan bo'lsa
  if (photoUrl) {
    if (!features.mediaUpload) return featureDisabledError('mediaUpload');
    if (!isOwnUploadUrl(photoUrl)) return { error: m.badPhotoUrl };
  }

  // Avval barcha tovarlar tekshiriladi (mavjudligi, qoldig'i) — yarim sotuv bo'lmasin.
  // Filial login faqat o'z filiali mahsulotini sotadi (IDOR himoyasi)
  const scope = branchFilter(user);
  const prepared: { product: IProduct & { _id: Types.ObjectId }; qty: number; listTotal: number }[] = [];
  for (const line of lines) {
    const product = await Product.findOne({ _id: line.productId, ...scope }).lean<IProduct & { _id: Types.ObjectId }>();
    if (!product || product.status !== 'in_stock') {
      return { error: multi && product ? tr(m.productNotInStock, { name: product.name }) : m.notInStock };
    }
    // dona — butun, kg/m… — ≤3 xona kasr
    const qtyCheck = checkSaleQty(product, line.qty);
    if (!qtyCheck.ok) {
      const msg = qtyCheck.reason === 'badQty' ? m.badQty : tr(m.onlyNLeft, { n: qtyWithUnit(qtyCheck.available, product.unit, d.stock.fields.units) });
      return { error: multi ? `${product.name}: ${msg}` : msg };
    }
    // Ro'yxat narxi bo'yicha jami (kasr miqdorda butun so'mga yaxlitlangan)
    prepared.push({ product, qty: qtyCheck.qty, listTotal: priceTimesQty(product.salePrice, qtyCheck.qty) });
  }
  // Ko'p tovarda jami narxlarga mutanosib bo'linadi — har birining narxi bo'lishi kerak
  if (multi) {
    const noPrice = prepared.find((p) => !(p.product.salePrice > 0));
    if (noPrice) return { error: tr(m.enterPriceFor, { name: noPrice.product.name }) };
  }
  const listTotal = prepared.reduce((s, p) => s + p.listTotal, 0);
  const priced = prepared.every((p) => p.product.salePrice > 0);
  // Sotuv narxidan arzon sotish — "sale.discount" huquqi kerak
  if (priced && totalAmount < listTotal && !(await userCan(user, 'sale.discount'))) return permissionDeniedError('sale.discount');
  // Sotuv narxidan qimmat sotish (narxni o'zgartirish) — "sale.editPrice" huquqi kerak (quickSaleBatchAction bilan bir xil)
  if (priced && totalAmount > listTotal && !(await userCan(user, 'sale.editPrice'))) return permissionDeniedError('sale.editPrice');

  const paidAmount = paymentType === 'cash' ? totalAmount : (paidAmountRaw ?? 0);
  if (paidAmount > totalAmount) return { error: m.paidExceeds };

  if (paymentType === 'installment' && !features.variant && !features.nasiya) {
    return { error: m.nasiyaDisabled };
  }
  if (paymentType === 'bank_credit' && !features.creditKassa) {
    return { error: m.creditKassaDisabled };
  }

  // Bank krediti: qolgan summa bir yoki bir nechta bankka bo'linadi (jami = jami − bosh to'lov)
  let bankParts: ISaleBankPart[] | undefined;
  if (paymentType === 'bank_credit') {
    const financed = totalAmount - paidAmount;
    const rawParts = parseBankPartsInput(parsed.data.bankParts);
    if (rawParts === null) return { error: m.bankRequired };
    // Eski forma / bitta bank: faqat bankName keladi — qolgan summa to'liq shu bankka
    const input = rawParts.length > 0 ? rawParts : bankName ? [{ bankName, amount: financed }] : [];
    const v = validateBankParts(input, financed);
    if (!v.ok) {
      return {
        error: {
          required: m.bankRequired,
          tooMany: tr(m.bankPartsTooMany, { n: MAX_BANK_PARTS }),
          duplicate: m.bankPartsDuplicate,
          badAmount: m.bankPartsBadAmount,
          nothingFinanced: m.bankNothingFinanced,
          sumMismatch: tr(m.bankPartsSum, { sum: financed.toLocaleString('uz-UZ') }),
        }[v.error],
      };
    }
    const names = v.parts.map((p) => p.bankName);
    const activeCount = await CreditBank.countDocuments({ name: { $in: names }, active: true });
    if (activeCount !== names.length) return { error: m.bankNotFound };
    bankParts = v.parts;
  }
  const bankLabel = bankParts ? bankPartsLabel(bankParts) : '';

  let installmentMonths: number | undefined;
  if (paymentType === 'installment') {
    installmentMonths = Number.isFinite(installmentMonthsRaw) && installmentMonthsRaw >= 1
      ? Math.min(60, Math.floor(installmentMonthsRaw))
      : undefined;
    if (!installmentMonths) return { error: m.monthsRequired };
    const pqErr = pq294MonthsError(installmentMonths, new Date(), locale);
    if (pqErr) return { error: pqErr };
  }

  // To'lov muddati — faqat qarz/nasiya/kredit va qoldiq bo'lsa
  let dueDate: Date | undefined;
  if (totalAmount > paidAmount && paymentType !== 'cash') {
    if (parsed.data.dueDate) dueDate = parsed.data.dueDate;
    // Nasiya bo'lsa va muddat kiritilmagan bo'lsa — oxirgi oy bo'yicha hisoblaymiz
    if (!dueDate && paymentType === 'installment' && installmentMonths) {
      dueDate = addMonthsClamped(new Date(), installmentMonths);
    }
  }

  let customer = null;
  if (customerName && customerPhone) {
    // Shu telefonli mijoz bor bo'lsa — uning ismi USTIDAN YOZILMAYDI (sotuvchi boshqa mijoz
    // kartochkasini o'zgartirib yubormasin); mijoz ismi "Mijozlar" bo'limida tahrirlanadi
    customer = await Customer.findOne({ phone: customerPhone }).lean();
    if (!customer) {
      customer = (await Customer.create({ fullName: customerName, phone: customerPhone })).toObject();
    }
  }

  // Qatorlar: jami, bosh to'lov va bank ulushlari aniq taqsimlanadi (lib/saleSplit.ts).
  // Har qator — alohida sotuv, bitta xarid (checkoutId) bilan bog'langan (POS'dagi kabi).
  const split = multi
    ? splitSale({ listTotals: prepared.map((p) => p.listTotal), total: totalAmount, paid: paidAmount, bankParts })
    : [{ total: totalAmount, paid: paidAmount, bankParts }];
  const checkoutId = multi ? newCheckoutId() : undefined;

  // "Hammasi yoki hech biri": biror qator o'tmasa, oldingilari bekor qilinadi (sotuv o'chadi, tovar omborga qaytadi)
  let shortOf: string | null = null;
  const outcome = await runWithCompensation(prepared, async ({ product, qty }, i) => {
    const line = split[i];
    const now = new Date();
    // Atomik: qoldiq tekshiruvi + ayirish bitta so'rovda
    const reserved = await reserveStock(Product, product._id, qty, {
      scope,
      history: { action: 'sold', detail: qtyLabel(qty, product.unit), by: user.username, at: now },
    });
    if (!reserved) { shortOf = product.name; return null; }

    const remaining = Math.max(0, line.total - line.paid);
    // Bosh to'lov qatorni to'liq yopgan bo'lsa — unga bank ulushi tushmaydi
    const lineBank = line.bankParts && line.bankParts.length > 0 ? line.bankParts : undefined;
    let saleId: Types.ObjectId;
    let saleNo: string;
    try {
      saleNo = await generateSaleNo(Sale);
      const sale = await Sale.create({
        saleNo,
        productId: product._id,
        productSnapshot: {
          name: product.name,
          imei: product.imei,
          brand: product.brand,
          deviceModel: product.deviceModel,
          purchasePrice: product.purchasePrice,
          saleQuantity: qty,
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
        bankName: lineBank ? bankPartsLabel(lineBank) : undefined,
        bankParts: lineBank,
        totalAmount: line.total,
        paidAmount: line.paid,
        remainingAmount: remaining,
        installmentMonths,
        // Nasiya boshlang'ich to'lovi = sotuv paytidagi paidAmount (oy jadvali shu asosda)
        downPayment: paymentType === 'installment' ? line.paid : undefined,
        dueDate: remaining > 0 ? dueDate : undefined,
        status: calcSaleStatus(line.total, line.paid),
        payments: line.paid > 0
          ? [{ amount: line.paid, paidAt: now, note: paymentType === 'cash' ? 'Naqd to\'lov' : 'Boshlang\'ich to\'lov', recordedBy: user.username }]
          : [],
        checkoutId,
        soldBy: user.username,
        notes: notes || undefined,
        photoUrl: photoUrl || undefined,
      });
      saleId = sale._id;
    } catch (err) {
      // Kompensatsiya: sotuv yozilmasa — mahsulot omborga qaytadi
      await releaseStock(Product, product._id, qty);
      throw err;
    }
    return {
      result: { saleId: String(saleId), saleNo, name: product.name, qty, unit: product.unit, total: line.total, bankParts: lineBank },
      undo: async () => {
        await Sale.deleteOne({ _id: saleId });
        await releaseStock(Product, product._id, qty, { action: 'returned', detail: 'Sotuv yakunlanmadi', by: user.username, at: new Date() });
      },
    };
  });

  if (!outcome.ok) {
    if (outcome.error) logError('createSaleAction failed', outcome.error, { user: user.username, dbName: user.dbName });
    if (shortOf) return { error: multi ? tr(m.notEnoughStockFor, { name: shortOf }) : m.notEnoughStock };
    return { error: m.saleFailed };
  }
  const results = outcome.results;

  for (const r of results) {
    await recordAudit(user, {
      action: 'sale.create',
      entity: 'sale',
      entityId: r.saleId,
      summary: `Sotuv ${r.saleNo}: ${r.name} · ${qtyLabel(r.qty, r.unit)} · ${r.total.toLocaleString('uz-UZ')} so'm (${paymentType})${multi ? ` · xarid ${results.length} ta tovar` : ''}`,
      meta: { saleQty: r.qty, totalAmount: r.total, paymentType, ...(r.bankParts ? { bankParts: r.bankParts } : {}), ...(checkoutId ? { checkoutId } : {}) },
    });
  }
  await markOnboardingStep(user.organizationId, 'saleMade');

  const first = results[0];
  const saleNos = results.map((r) => r.saleNo).sort();
  const noLabel = saleNos.length > 1 ? `${saleNos[0]} – ${saleNos[saleNos.length - 1]}` : saleNos[0];
  void sendTelegram(
    `<b>Savora — Yangi sotuv</b>\n` +
    `${tgEscape(noLabel)} · ${results.map((r) => `${tgEscape(r.name)} (${qtyLabel(r.qty, r.unit)})`).join(', ')}\n` +
    (customer ? `Mijoz: ${tgEscape(customer.fullName)}\n` : '') +
    `Summa: ${totalAmount.toLocaleString('uz-UZ')} so'm\n` +
    `To'lov: ${tgEscape(paymentType)}${bankLabel ? ` (${tgEscape(bankLabel)})` : ''}`,
  );
  void notifyNewSale(user, {
    saleNo: saleNos[0], items: results.length, firstItem: first.name, total: totalAmount,
    payment: salePayLabel(paymentType), by: user.username,
  });

  revalidatePath('/app');
  revalidatePath('/app/sales');
  revalidatePath('/app/products');
  if (paymentType === 'bank_credit') revalidatePath('/app/kredit-kassa');
  if (paymentType === 'debt') revalidatePath('/app/debts');
  redirect(`/app/sales/${first.saleId}?created=1`);
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
  }), formToObject(formData), m.badPaymentAmount);
  if (!parsed.ok) return { error: parsed.error };
  const { saleId, amount, method, note } = parsed.data;

  // Filial login faqat o'z filiali sotuviga to'lov qo'shadi
  const sale = await Sale.findOne({ _id: saleId, ...branchFilter(user) }).lean();
  if (!sale) return { error: m.saleNotFound };
  if (sale.status === 'cancelled') return { error: m.cancelledNoPayment };
  if (sale.status === 'paid') return { error: m.alreadyPaid };
  // Bank krediti: pulni bank o'tkazadi — Kredit kassada bank bo'yicha yoziladi (ikki marta hisoblanmasin)
  if (sale.paymentType === 'bank_credit') return { error: m.bankSalePayment };
  if (amount > sale.remainingAmount) return { error: tr(m.remainingIs, { sum: sale.remainingAmount.toLocaleString('uz-UZ') }) };

  // Nasiya: izoh haqiqiy taqsimotdan ("2-oy (qisman)", "2–3-oy to'lovi") — to'lov doim
  // eng erta to'lanmagan oyga tushadi, foydalanuvchi qaysi oyni bosganidan qat'i nazar
  const autoNote = !note && sale.paymentType === 'installment'
    ? installmentPaymentNote(computeInstallmentPlan(sale)?.schedule ?? [], amount)
    : undefined;

  // Atomik: qoldiq sharti bilan bitta yozuv — ikki parallel to'lov ortiqcha to'lovga olib kelmaydi
  const res = await applySalePayment(Sale, saleId, amount, {
    scope: branchFilter(user),
    note: note || autoNote,
    recordedBy: user.username,
    method,
  });
  if (!res) return { error: m.paymentConflict };

  await recordAudit(user, {
    action: 'sale.payment',
    entity: 'sale',
    entityId: saleId,
    summary: `To'lov qabul qilindi: ${sale.saleNo} · ${amount.toLocaleString('uz-UZ')} so'm, ${method} (qoldiq ${res.remainingAmount.toLocaleString('uz-UZ')} so'm)`,
    meta: { amount, method, remaining: res.remainingAmount, status: res.status },
  });

  revalidatePath('/app/sales');
  revalidatePath(`/app/sales/${saleId}`);
  revalidatePath('/app/nasiya');
  revalidatePath('/app/debts');
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
