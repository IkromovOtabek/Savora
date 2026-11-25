'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getTenantSession } from '@/lib/tenantSession';
import { afterSales, checkSaleMarking, loadSaleLines, resolveCustomerFor, saleCoreErrorText, writeSales } from '@/lib/sales/createSales';
import { resolveSaleTerms, saleTermsErrorText } from '@/lib/sales/terms';
import { featureDisabledError } from '@/lib/featureAction';
import { checkPermission, userCan } from '@/lib/permissionGuard';
import { permissionDeniedError } from '@/lib/permissions';
import { allocateDiscount, discountAmount, unitPriceFor } from '@/lib/posCart';
import { parseInput, zId, zMoney, zOneOf, zOptDate, zOptInt, zOptQty, zText } from '@/lib/validation';
import { PAY_METHODS, allocateParts, settlePayment, type PayMethod } from '@/lib/payMethods';
import { newCheckoutId, receiptPath } from '@/lib/receiptLink';
import { isFractionalUnit, priceTimesQty, qtyLabel } from '@/lib/qty';
import { getI18n } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import { MARKING_MAX_PER_LINE } from '@/lib/marking';

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
  /** markingCodes — skanerlangan DataMatrix kodlari (har dona uchun bittadan, lib/marking.ts) */
  lines: { productId: string; qty: number; price?: number; markingCodes?: string[] }[];
  wholesale: boolean;
  discount: { kind: 'percent' | 'amount'; value: number };
  customerName?: string;
  customerPhone?: string;
  note?: string;
  /**
   * full — to'liq to'lov (aralash bo'lishi mumkin); debt — qarzga (qisman to'lov bilan, qaytarish sanasi);
   * installment — qolgani nasiyaga (oyma-oy, `months`) — faqat bitta tovarli savatchada
   */
  payment: { mode: 'full' | 'debt' | 'installment'; parts: { method: PayMethod; amount: number }[]; dueDate?: string; months?: number };
}

/**
 * Kassa (POS) savatchasini sotish: har bir qator — alohida sotuv, umumiy checkoutId bilan.
 * To'lov: naqd/UzCard/HUMO/Click/Payme (aralash ham) yoki qarzga — qismlar qatorlarga ketma-ket taqsimlanadi.
 * Narx va chegirma serverda qayta hisoblanadi (client faqat tanlov yuboradi).
 * Chegirma katalog narxini O'ZGARTIRMAYDI — faqat sotuv summasi kamayadi.
 */
export async function posSaleAction(input: PosSaleInput): Promise<State> {
  const { user, org, Product, Sale, Customer, features, ShopSettings } = await getTenantSession();
  const { d, locale } = await getI18n();
  const m = d.sales.actions;
  const k = d.sales.pos;
  if (!features.sales) return featureDisabledError('sales');
  { const denied = await checkPermission(user, 'sale.create'); if (denied) return denied; }

  const parsed = parseInput(z.object({
    lines: z.array(z.object({
      productId: zId(m.badProductId),
      qty: zOptQty(m.badQty),
      price: zMoney(m.priceWhole, { optional: true }),
      markingCodes: z.array(z.string().min(8).max(200)).max(MARKING_MAX_PER_LINE).optional(),
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
      mode: zOneOf(['full', 'debt', 'installment'] as const, k.badPayment),
      parts: z.array(z.object({
        method: zOneOf(PAY_METHODS, k.badPayment),
        amount: zMoney(k.badPayment),
      })).max(PAY_METHODS.length * 2, k.badPayment),
      dueDate: zOptDate(k.badPayment),
      months: zOptInt(m.monthsRequired, 1, 60),
    }),
  }), input, m.noProductsSelected);
  if (!parsed.ok) return { error: parsed.error };
  const { lines, wholesale, discount, customerName, note, payment } = parsed.data;
  // Telefon faqat raqamlar — formatlangan kirishlar bir mijozga tushadi (mobil API bilan bir xil)
  const customerPhone = parsed.data.customerPhone.replace(/\D/g, '');
  if (parsed.data.customerPhone && (customerPhone.length < 9 || customerPhone.length > 15)) return { error: k.badPhone };
  // Nasiya ham qarz kabi: mijoz majburiy, qoldiq Qarzdorlik/Nasiya bo'limiga tushadi
  const isInstall = payment.mode === 'installment';
  const isDebt = payment.mode !== 'full';
  if (isDebt && (!customerName || !customerPhone)) return { error: k.debtNeedsCustomer };

  // Tovarlar (filial doirasi, omborda, miqdor) — lib/sales/createSales (barcha sotuv yo'llari bilan bir yadro)
  const loaded = await loadSaleLines({ Product }, user, lines.map((l) => ({ productId: l.productId, qty: l.qty })));
  if (!loaded.ok) return { error: saleCoreErrorText(loaded.error, d) };
  // Birlik narxi: ulgurji / chakana; boshqa narx — «Narxni o'zgartirish» huquqi bilan
  const canEditPrice = await userCan(user, 'sale.editPrice');
  const prepared = [];
  for (const [i, pl] of loaded.lines.entries()) {
    let unit = unitPriceFor(pl.product, wholesale);
    const price = lines[i].price;
    if (price > 0 && price !== unit) {
      if (unit > 0 && !canEditPrice) return permissionDeniedError('sale.editPrice');
      unit = price;
    }
    if (!unit || unit <= 0) return { error: tr(m.enterPriceFor, { name: pl.product.name }) };
    prepared.push({ ...pl, unit });
  }

  // Markirovka: kodlar formati, tovarga mosligi, avval sotilmaganligi; «majburiy» rejimda kodsiz sotilmaydi
  const marking = await checkSaleMarking({ Sale, ShopSettings }, prepared, lines.map((l) => l.markingCodes ?? []));
  if (!marking.ok) return { error: saleCoreErrorText(marking.error, d) };

  // Narx va chegirma (chegirma katalog narxini o'zgartirmaydi — faqat sotuv summasi kamayadi)
  const lineTotals = prepared.map((p) => priceTimesQty(p.unit, p.qty));
  const subtotal = lineTotals.reduce((sum, n) => sum + n, 0);
  const disc = discountAmount(subtotal, discount);
  if (disc >= subtotal) return { error: k.discountTooBig };
  if (disc > 0 && !(await userCan(user, 'sale.discount'))) return permissionDeniedError('sale.discount');
  const lineDisc = allocateDiscount(lineTotals, disc);
  const finalTotals = lineTotals.map((t, i) => t - lineDisc[i]);
  const grandTotal = subtotal - disc;

  // To'lov: naqd/karta (aralash ham) yoki qarz / nasiya — qismlar qatorlarga ketma-ket taqsimlanadi
  const settled = settlePayment(grandTotal, payment.parts, isDebt ? 'debt' : 'full');
  if (!settled.ok) return { error: k[settled.reason] };
  const lineParts = allocateParts(finalTotals, settled.parts);

  // To'lov shartlari (nasiya oylari, PQ-294, muddat) — lib/sales/terms (web va mobil bilan bir qoida)
  const t = await resolveSaleTerms({
    paymentType: isInstall ? 'installment' : isDebt ? 'debt' : 'cash', total: grandTotal, paid: settled.paid, lineCount: prepared.length,
    months: payment.months, dueDate: payment.dueDate, features, locale,
  }, async () => false);
  if (!t.ok) return { error: t.error.code === 'installmentOneItem' ? d.crm.money.restOneItem : saleTermsErrorText(t.error, d) };

  const cust = await resolveCustomerFor({ Customer }, { name: customerName, phone: customerPhone }, isDebt);
  if (!cust.ok) return { error: cust.error.code === 'customer' && cust.error.reason === 'badPhone' ? k.badPhone : saleCoreErrorText(cust.error, d) };

  const checkoutId = newCheckoutId();
  const written = await writeSales({ Product, Sale }, user, {
    lines: prepared.map((p, i) => ({ ...p, total: finalTotals[i], parts: lineParts[i], discount: lineDisc[i] || undefined, marking: marking.lines[i] })),
    terms: t.terms, customer: cust.customer, checkoutId, notes: note,
    productSet: { soldPaymentType: isDebt ? 'debt' : 'cash' },
    stockDetail: (l) => `${qtyLabel(l.qty, l.product.unit)} · ${l.total.toLocaleString('uz-UZ')} so'm`,
  });
  if (!written.ok) return { error: 'error' in written ? saleCoreErrorText(written.error, d) : m.sellFailed };
  const results = written.sales;

  const payLabel = isInstall
    ? `nasiya ${t.terms.months} oy (${settled.paid.toLocaleString('uz-UZ')} to'landi)`
    : isDebt
    ? `qarz (${settled.paid.toLocaleString('uz-UZ')} to'landi)`
    : settled.parts.map((p) => `${p.method} ${p.amount.toLocaleString('uz-UZ')}`).join(' + ');
  await afterSales(user, results, {
    terms: t.terms, methods: settled.parts.map((p) => p.method), source: 'pos', checkoutId,
    extra: `Kassa${wholesale ? ' (ulgurji)' : ''} · ${payLabel}`,
  });

  // Dona o'lchovli savatchada — dona soni; kasrli (kg) qatorlar bo'lsa — qatorlar soni
  const soldCount = results.some((r) => isFractionalUnit(r.product.unit))
    ? results.length
    : results.reduce((sum, r) => sum + r.qty, 0);
  const soldTotal = results.reduce((sum, r) => sum + r.total, 0);

  revalidatePath('/app');
  revalidatePath('/app/products');
  revalidatePath('/app/sales');
  revalidatePath('/app/shifts');
  if (isDebt) revalidatePath('/app/debts');
  if (isInstall) revalidatePath('/app/nasiya');
  const saleIds = results.map((r) => r.saleId);
  const sorted = results.map((r) => r.saleNo).sort();
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
