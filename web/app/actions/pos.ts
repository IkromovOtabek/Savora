'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { Types } from 'mongoose';
import type { IProduct } from '@/lib/models/tenant/Product';
import { getTenantSession } from '@/lib/tenantSession';
import { generateSaleNo } from '@/lib/sales';
import { reserveStock, releaseStock } from '@/lib/stock';
import { recordAudit } from '@/lib/audit';
import { markOnboardingStep } from '@/lib/onboarding';
import { branchFilter } from '@/lib/branchScope';
import { logError } from '@/lib/logger';
import { featureDisabledError } from '@/lib/featureAction';
import { checkPermission, userCan } from '@/lib/permissionGuard';
import { permissionDeniedError } from '@/lib/permissions';
import { runWithCompensation } from '@/lib/compensate';
import { allocateDiscount, discountAmount, unitPriceFor } from '@/lib/posCart';
import { parseInput, zId, zMoney, zOneOf, zOptDate, zOptQty, zText } from '@/lib/validation';
import { PAY_METHODS, allocateParts, settlePayment, type PayMethod } from '@/lib/payMethods';
import { calcSaleStatus } from '@/lib/sales';
import { newCheckoutId, receiptPath } from '@/lib/receiptLink';
import { checkSaleQty } from '@/lib/productQuantity';
import { isFractionalUnit, priceTimesQty, qtyLabel } from '@/lib/qty';
import { getI18n } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';

/** Muvaffaqiyatli kassa sotuvi natijasi — muvaffaqiyat oynasi va chek uchun */
export interface PosDone {
  /** Kassa cheki uchun (har qator alohida Sale) */
  saleIds: string[];
  /** Chekdagi raqam: bitta qator — S-0001, ko'p qator — S-0001 – S-0003 */
  receiptNo: string;
  total: number;
  /** Naqd ortiqcha berilgan — mijozga qaytim */
  change: number;
  /** Qarzga qolgan summa (qarz rejimida) */
  debt: number;
  /** Mijozga ulashiladigan ochiq chek yo'li (/r/…) */
  publicPath: string;
}
type State = { error?: string; success?: string; done?: PosDone; saleIds?: string[] } | null;

const POS_MAX_LINES = 100;

export interface PosSaleInput {
  lines: { productId: string; qty: number; price?: number }[];
  wholesale: boolean;
  discount: { kind: 'percent' | 'amount'; value: number };
  customerName?: string;
  customerPhone?: string;
  note?: string;
  /** full — to'liq to'lov (aralash bo'lishi mumkin); debt — qarzga (qisman to'lov bilan) */
  payment: { mode: 'full' | 'debt'; parts: { method: PayMethod; amount: number }[]; dueDate?: string };
}

/**
 * Kassa (POS) savatchasini sotish: har bir qator — alohida sotuv, umumiy checkoutId bilan.
 * To'lov: naqd/UzCard/HUMO/Click/Payme (aralash ham) yoki qarzga — qismlar qatorlarga ketma-ket taqsimlanadi.
 * Narx va chegirma serverda qayta hisoblanadi (client faqat tanlov yuboradi).
 * Chegirma katalog narxini O'ZGARTIRMAYDI — faqat sotuv summasi kamayadi.
 */
export async function posSaleAction(input: PosSaleInput): Promise<State> {
  const { user, org, Product, Sale, Customer, features } = await getTenantSession();
  const { d } = await getI18n();
  const m = d.sales.actions;
  const k = d.sales.pos;
  if (!features.sales) return featureDisabledError('sales');
  { const denied = await checkPermission(user, 'sale.create'); if (denied) return denied; }

  const parsed = parseInput(z.object({
    lines: z.array(z.object({
      productId: zId(m.badProductId),
      qty: zOptQty(m.badQty),
      price: zMoney(m.priceWhole, { optional: true }),
    })).min(1, m.noProductsSelected).max(POS_MAX_LINES, m.noProductsSelected),
    wholesale: z.boolean(),
    discount: z.object({
      kind: zOneOf(['percent', 'amount'] as const, k.discountBad),
      value: zMoney(k.discountBad, { optional: true }),
    }),
    customerName: zText(100),
    customerPhone: zText(30),
    note: zText(300),
    payment: z.object({
      mode: zOneOf(['full', 'debt'] as const, k.badPayment),
      parts: z.array(z.object({
        method: zOneOf(PAY_METHODS, k.badPayment),
        amount: zMoney(k.badPayment),
      })).max(PAY_METHODS.length * 2, k.badPayment),
      dueDate: zOptDate(k.badPayment),
    }),
  }), input, m.noProductsSelected);
  if (!parsed.ok) return { error: parsed.error };
  const { lines, wholesale, discount, customerName, note, payment } = parsed.data;
  // Telefon faqat raqamlar — formatlangan kirishlar bir mijozga tushadi (mobil API bilan bir xil)
  const customerPhone = parsed.data.customerPhone.replace(/\D/g, '');
  if (parsed.data.customerPhone && (customerPhone.length < 9 || customerPhone.length > 15)) return { error: k.badPhone };
  const isDebt = payment.mode === 'debt';
  if (isDebt && (!customerName || !customerPhone)) return { error: k.debtNeedsCustomer };

  const scope = branchFilter(user);
  const canEditPrice = await userCan(user, 'sale.editPrice');

  // 1) Avval barcha qatorlar tekshiriladi (mavjudligi, qoldig'i, narxi) — yarim sotuv bo'lmasin
  const prepared: { found: IProduct & { _id: Types.ObjectId }; qty: number; unit: number }[] = [];
  for (const line of lines) {
    const found = await Product.findOne({ _id: line.productId, ...scope }).lean<IProduct & { _id: Types.ObjectId }>();
    if (!found) return { error: m.productNotFoundOrDenied };
    if (found.status !== 'in_stock') return { error: tr(m.productNotInStock, { name: found.name }) };
    // dona — butun, kg/m… — ≤3 xona kasr
    const qtyCheck = checkSaleQty(found, line.qty);
    if (!qtyCheck.ok) return { error: qtyCheck.reason === 'badQty' ? `${found.name}: ${m.badQty}` : tr(m.notEnoughStockFor, { name: found.name }) };
    const qty = qtyCheck.qty;

    let unit = unitPriceFor(found, wholesale);
    if (line.price > 0 && line.price !== unit) {
      // Narxi bor mahsulotda qo'lda narx — "sale.editPrice" huquqi kerak
      if (unit > 0 && !canEditPrice) return permissionDeniedError('sale.editPrice');
      unit = line.price;
    }
    if (!unit || unit <= 0) return { error: tr(m.enterPriceFor, { name: found.name }) };
    prepared.push({ found, qty, unit });
  }

  // Kasr miqdorda qator jami butun so'mga yaxlitlanadi (client PosScreen bilan bir xil formula)
  const lineTotals = prepared.map((p) => priceTimesQty(p.unit, p.qty));
  const subtotal = lineTotals.reduce((s, n) => s + n, 0);
  const disc = discountAmount(subtotal, discount);
  if (disc >= subtotal) return { error: k.discountTooBig };
  if (disc > 0 && !(await userCan(user, 'sale.discount'))) return permissionDeniedError('sale.discount');
  const lineDisc = allocateDiscount(lineTotals, disc);
  const finalTotals = lineTotals.map((t, i) => t - lineDisc[i]);
  const grandTotal = subtotal - disc;

  // To'lov: to'liq rejimda summa yetarli bo'lishi, karta summadan oshmasligi; qaytim — faqat naqddan
  const settled = settlePayment(grandTotal, payment.parts, payment.mode);
  if (!settled.ok) return { error: k[settled.reason] };
  const lineParts = allocateParts(finalTotals, settled.parts);
  const dueDate = isDebt && settled.paid < grandTotal ? payment.dueDate : undefined;

  // Qarzda mijoz kartochkasi majburiy (Qarzdorlar bo'limida ko'rinadi). Telefon bo'yicha topiladi —
  // mavjud mijoz ismi ustidan yozilmaydi (createSaleAction bilan bir xil qoida).
  let customer: { _id?: Types.ObjectId; fullName: string; phone?: string } | undefined;
  if (isDebt) {
    const found = await Customer.findOne({ phone: customerPhone }).lean();
    const c = found ?? (await Customer.create({ fullName: customerName, phone: customerPhone })).toObject();
    customer = { _id: c._id, fullName: c.fullName, phone: c.phone };
  } else if (customerName) {
    customer = { fullName: customerName, phone: customerPhone || undefined };
  }
  const checkoutId = newCheckoutId();

  // 2) Sotish — "hammasi yoki hech biri": biror qator o'tmasa, oldingilari bekor qilinadi
  //    (sotuv yozuvi o'chadi, mahsulot omborga qaytadi). Audit faqat to'liq muvaffaqiyatdan keyin.
  let shortOf: string | null = null;
  const saleNos: string[] = [];
  const outcome = await runWithCompensation(prepared, async ({ found, qty, unit }, i) => {
    const total = finalTotals[i];
    const parts = lineParts[i];
    const paid = parts.reduce((s, p) => s + p.amount, 0);
    const now = new Date();
    const product = await reserveStock(Product, found._id, qty, {
      scope,
      set: { soldPaymentType: isDebt ? 'debt' : 'cash' },
      history: { action: 'sold', detail: `${qtyLabel(qty, found.unit)} · ${total.toLocaleString('uz-UZ')} so'm`, by: user.username, at: now },
    });
    if (!product) { shortOf = found.name; return null; }
    const restock = () => releaseStock(Product, product._id, qty, { action: 'returned', detail: 'Kassa: sotuv yakunlanmadi', by: user.username, at: new Date() });

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
          saleQuantity: qty,
          unit: product.unit,
        },
        ...(customer ? { ...(customer._id ? { customerId: customer._id } : {}), customerSnapshot: { fullName: customer.fullName, phone: customer.phone } } : {}),
        branchId: product.branchId,
        paymentType: isDebt ? 'debt' : 'cash',
        totalAmount: total,
        paidAmount: paid,
        remainingAmount: total - paid,
        status: calcSaleStatus(total, paid),
        ...(dueDate && total > paid ? { dueDate } : {}),
        // Qarzdagi bosh to'lov izohi — naqd qismi kassaga tushum bo'lib hisoblanadi (lib/kassa)
        payments: parts.map((p) => ({ amount: p.amount, paidAt: now, recordedBy: user.username, method: p.method, ...(isDebt ? { note: "Boshlang'ich to'lov" } : {}) })),
        checkoutId,
        ...(lineDisc[i] > 0 ? { discount: lineDisc[i] } : {}),
        notes: note || undefined,
        soldBy: user.username,
      });
      saleId = sale._id;
      saleNos.push(saleNo);
    } catch (err) {
      await restock();
      throw err;
    }
    return {
      result: { productId: String(product._id), saleId: String(saleId), name: product.name, qty, measure: found.unit, unit, discount: lineDisc[i], total },
      undo: async () => { await Sale.deleteOne({ _id: saleId }); await restock(); },
    };
  });

  if (!outcome.ok) {
    if (outcome.error) logError('posSaleAction failed', outcome.error, { user: user.username, dbName: user.dbName });
    return { error: shortOf ? tr(m.notEnoughStockFor, { name: shortOf }) : m.sellFailed };
  }

  const payLabel = isDebt
    ? `qarz (${settled.paid.toLocaleString('uz-UZ')} to'landi)`
    : settled.parts.map((p) => `${p.method} ${p.amount.toLocaleString('uz-UZ')}`).join(' + ');
  for (const r of outcome.results) {
    await recordAudit(user, {
      action: 'sale.pos',
      entity: 'sale',
      entityId: r.productId,
      summary: `Kassa: ${r.name} · ${qtyLabel(r.qty, r.measure)} × ${r.unit.toLocaleString('uz-UZ')}${r.discount ? ` − ${r.discount.toLocaleString('uz-UZ')} chegirma` : ''} = ${r.total.toLocaleString('uz-UZ')} so'm${wholesale ? ' (ulgurji)' : ''} · ${payLabel}`,
      meta: { qty: r.qty, unit: r.unit, discount: r.discount, total: r.total, wholesale, payment: payment.mode, parts: settled.parts, checkoutId },
    });
  }
  // Birliklar aralash bo'lsa (kg + dona) miqdorlarni qo'shib bo'lmaydi — unda qatorlar soni
  const soldCount = outcome.results.some((r) => isFractionalUnit(r.measure))
    ? outcome.results.length
    : outcome.results.reduce((s, r) => s + r.qty, 0);
  const soldTotal = outcome.results.reduce((s, r) => s + r.total, 0);

  await markOnboardingStep(user.organizationId, 'saleMade');
  revalidatePath('/app');
  revalidatePath('/app/products');
  revalidatePath('/app/sales');
  revalidatePath('/app/shifts');
  if (isDebt) revalidatePath('/app/debts');
  const saleIds = outcome.results.map((r) => r.saleId);
  const sorted = [...saleNos].sort();
  return {
    success: tr(m.quickSold, { n: soldCount, sum: soldTotal.toLocaleString('uz-UZ') }),
    saleIds,
    done: {
      saleIds,
      receiptNo: sorted.length > 1 ? `${sorted[0]} – ${sorted[sorted.length - 1]}` : sorted[0],
      total: soldTotal,
      change: settled.change,
      debt: soldTotal - settled.paid,
      publicPath: receiptPath(String(org._id), checkoutId),
    },
  };
}
