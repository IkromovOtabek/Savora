/**
 * Sotuv yadrosi — sotuvni yozuvchi YAGONA yo'l (web «Yangi sotuv», mobil API; keyin POS, tezkor sotuv,
 * «Sotildi», oflayn sinxron). Kirish (forma/JSON) va javob formati chaqiruvchida; bu yerda:
 *   1) tovar qatorlarini yuklash (filial doirasi, omborda, miqdor) — `loadSaleLines`;
 *   2) mijoz — `resolveCustomerFor` (naqdda ixtiyoriy; qarz/nasiya/bankda majburiy);
 *   3) markirovka — `checkSaleMarking` (do'kon «majburiy» rejimida markirovkali tovar kodsiz sotilmaydi);
 *   4) ombordan ayirish + sotuv yozuvi, «hammasi yoki hech biri» — `writeSales`;
 *   5) audit, bildirishnoma, onboarding — `afterSales`.
 * Xatolar kod bilan (`SaleCoreError`), matn — `saleCoreErrorText` (lug'atdan).
 */
import type { Model, Types } from 'mongoose';
import type { IProduct } from '../models/tenant/Product';
import type { ISale, ISaleBankPart } from '../models/tenant/Sale';
import type { ICustomer } from '../models/tenant/Customer';
import type { SessionUser } from '../session';
import type { Dict } from '../i18n/dict';
import { tr, qtyWithUnit } from '../i18n/fmt';
import { branchFilter } from '../branchScope';
import { checkSaleQty, isStockless } from '../productQuantity';
import { priceTimesQty, qtyLabel } from '../qty';
import { reserveStock, releaseStock } from '../stock';
import { runWithCompensation } from '../compensate';
import { calcSaleStatus, generateSaleNo } from '../sales';
import { resolveSaleCustomer, type SaleCustomerError } from '../saleCustomer';
import { checkMarkingLines, markingModeOf, serialOfKey, soldMarkingConflict, type MarkingLineError } from '../marking';
import { localDateKey } from '../gs1';
import { getShopSettings } from '../shopSettings';
import { recordAudit } from '../audit';
import { notifyNewSale, salePayLabel } from '../shopNotify';
import { markOnboardingStep } from '../onboarding';
import { isDupKey } from '../dbError';
import type { PayPart } from '../payMethods';
import { bankPartsLabel } from '../bankCredit';
import { saleRemaining, type SaleTerms } from './terms';

type ProductDoc = IProduct & { _id: Types.ObjectId };

export interface SaleModels {
  Product: Model<IProduct>;
  Sale: Model<ISale>;
  Customer: Model<ICustomer>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ShopSettings: Model<any>;
}

export type SaleCoreError =
  | { code: 'notInStock'; name?: string }
  | { code: 'badQty'; name?: string }
  | { code: 'onlyNLeft'; name?: string; available: number; unit?: IProduct['unit'] }
  | { code: 'enterPriceFor'; name: string }
  | { code: 'notEnoughStock'; name?: string }
  | { code: 'customer'; reason: SaleCustomerError }
  | { code: 'marking'; error: MarkingLineError }
  | { code: 'markingSold'; serial: string }
  | { code: 'failed' };

export interface PreparedLine {
  product: ProductDoc;
  qty: number;
  /** Ro'yxat narxi × miqdor (butun so'm) */
  listTotal: number;
}

/**
 * Tovar qatorlari: filial login faqat o'z filiali tovarini (IDOR himoyasi), omborda va miqdori yetarli.
 * Bir nechta tovarda xatoga tovar nomi qo'shiladi.
 */
export async function loadSaleLines(
  m: Pick<SaleModels, 'Product'>,
  user: SessionUser,
  lines: readonly { productId: string; qty?: number }[],
): Promise<{ ok: true; lines: PreparedLine[] } | { ok: false; error: SaleCoreError }> {
  const scope = branchFilter(user);
  const multi = lines.length > 1;
  const out: PreparedLine[] = [];
  for (const line of lines) {
    const product = await m.Product.findOne({ _id: line.productId, ...scope }).lean<ProductDoc>();
    if (!product || product.status !== 'in_stock') return { ok: false, error: { code: 'notInStock', name: multi ? product?.name : undefined } };
    const q = checkSaleQty(product, line.qty);
    if (!q.ok) {
      const name = multi ? product.name : undefined;
      return { ok: false, error: q.reason === 'badQty' ? { code: 'badQty', name } : { code: 'onlyNLeft', name, available: q.available, unit: product.unit } };
    }
    out.push({ product, qty: q.qty, listTotal: priceTimesQty(product.salePrice, q.qty) });
  }
  return { ok: true, lines: out };
}

export type SaleCustomerSnap = { _id?: Types.ObjectId; fullName: string; phone?: string };

/**
 * Sotuv mijozi. Tanlangan (id) yoki ism + telefon bo'lsa — mijozlar ro'yxatidan topiladi / ochiladi.
 * `required` (qarz, nasiya, bank) — mijozsiz bo'lmaydi. Naqdda ixtiyoriy: faqat ism bo'lsa — chekda ism, kartochkasiz.
 */
export async function resolveCustomerFor(
  m: Pick<SaleModels, 'Customer'>,
  input: { customerId?: string; name?: string; phone?: string },
  required: boolean,
): Promise<{ ok: true; customer: SaleCustomerSnap | null } | { ok: false; error: SaleCoreError }> {
  const name = (input.name ?? '').trim();
  const phone = (input.phone ?? '').trim();
  if (input.customerId || (name && phone) || required) {
    const r = await resolveSaleCustomer(m, { customerId: input.customerId, name, phone });
    if (!r.ok) return { ok: false, error: { code: 'customer', reason: r.error } };
    return { ok: true, customer: r.customer };
  }
  return { ok: true, customer: name ? { fullName: name } : null };
}

/**
 * Markirovka (lib/marking): kodlar formati, tovarga mosligi, takrorlanmasligi va avval sotilmaganligi.
 * «Majburiy» rejimda markirovkali tovar kodsiz sotilmaydi — kod skaner qilinadigan kassadan (POS) sotiladi.
 */
export async function checkSaleMarking(
  m: Pick<SaleModels, 'Sale' | 'ShopSettings'>,
  lines: readonly PreparedLine[],
  codes: readonly (readonly string[] | undefined)[],
): Promise<{ ok: true; lines: { codes: string[]; keys: string[] }[] } | { ok: false; error: SaleCoreError }> {
  const mode = markingModeOf((await getShopSettings(m.ShopSettings)).stock?.markingMode);
  const res = checkMarkingLines(lines.map(({ product, qty }, i) => ({
    name: product.name,
    qty,
    unit: product.unit,
    marked: (product.kind ?? 'goods') === 'goods' && !!product.marked,
    productCodes: [product.barcode, product.imei],
    codes: codes[i] ?? [],
  })), mode, localDateKey());
  if (!res.ok) return { ok: false, error: { code: 'marking', error: res.error } };
  const keys = res.lines.flatMap((l) => l.keys);
  if (keys.length) {
    const sold = await m.Sale.find({ markingKeys: { $in: keys }, status: { $ne: 'cancelled' } }).select('markingKeys returns status').lean();
    const conflict = soldMarkingConflict(keys, sold);
    if (conflict) return { ok: false, error: { code: 'markingSold', serial: serialOfKey(conflict) } };
  }
  return { ok: true, lines: res.lines };
}

export interface SaleLineWrite extends PreparedLine {
  total: number;
  /** Shu qatorga tushgan to'lov qismlari (usul bo'yicha) */
  parts: PayPart[];
  bankParts?: ISaleBankPart[];
  /** Chegirma (POS) — ro'yxat jamidan ayirilgan */
  discount?: number;
  marking?: { codes: string[]; keys: string[] };
  /**
   * Sotilgan birlik narxi (tezkor sotuv, «Sotildi»). Yagona dona (IMEI) yoki narxsiz tovarda katalog narxi
   * shu bilan yangilanadi; miqdorli tovarda — qolgan zaxira narxi o'zgarmaydi.
   */
  soldUnitPrice?: number;
}

/** Sotilgan narx katalogga yoziladimi: yagona dona yoki narxsiz tovar */
export function writesCatalogPrice(product: Pick<IProduct, 'salePrice' | 'trackQuantity' | 'kind'>, unit?: number): boolean {
  if (!unit || unit <= 0 || unit === product.salePrice) return false;
  if (!(product.salePrice > 0)) return true;
  return !product.trackQuantity && !isStockless(product);
}

export interface WrittenSale {
  saleId: string;
  saleNo: string;
  product: ProductDoc;
  qty: number;
  total: number;
  remaining: number;
  bankParts?: ISaleBankPart[];
  discount?: number;
}

/**
 * Ombordan ayirish (atomik) va sotuv yozuvi — qatorlar bo'yicha, «hammasi yoki hech biri»:
 * biror qator o'tmasa oldingilari bekor qilinadi (sotuv o'chadi, tovar omborga qaytadi).
 * `clientSaleId` bo'lsa (mobil/oflayn) — takroriy yozuvda `duplicate` qaytadi.
 */
export async function writeSales(
  m: Pick<SaleModels, 'Product' | 'Sale'>,
  user: SessionUser,
  input: {
    lines: readonly SaleLineWrite[];
    terms: SaleTerms;
    customer: SaleCustomerSnap | null;
    checkoutId?: string;
    clientSaleId?: string;
    notes?: string;
    photoUrl?: string;
    /** Ombor tarixidagi izoh (standart — miqdor) */
    stockDetail?: (line: SaleLineWrite) => string;
    /** Tovarga qo'shimcha belgi (POS: soldPaymentType) */
    productSet?: Record<string, unknown>;
    /** Sotuv vaqti (oflayn sotuv — qurilmadagi vaqt); to'lov ham shu vaqtda */
    at?: Date;
    /** Sotuv yozuviga qo'shimcha maydonlar (oflayn: offline, syncedAt) */
    saleExtra?: Record<string, unknown>;
  },
): Promise<{ ok: true; sales: WrittenSale[] } | { ok: false; error: SaleCoreError } | { ok: false; duplicate: true }> {
  const { terms, customer } = input;
  const scope = branchFilter(user);
  let shortOf: string | null = null;
  let duplicate = false;

  const outcome = await runWithCompensation(input.lines, async (line, idx) => {
    const { product, qty } = line;
    const now = input.at ?? new Date();
    const catalogPrice = writesCatalogPrice(product, line.soldUnitPrice);
    const set = { ...input.productSet, ...(catalogPrice ? { salePrice: line.soldUnitPrice } : {}) };
    const reserved = await reserveStock(m.Product, product._id, qty, {
      scope,
      ...(Object.keys(set).length ? { set } : {}),
      history: { action: 'sold', detail: input.stockDetail ? input.stockDetail(line) : qtyLabel(qty, product.unit), by: user.username, at: now },
    });
    if (!reserved) { shortOf = product.name; return null; }
    const restock = async (history?: boolean) => {
      await releaseStock(m.Product, product._id, qty, history ? { action: 'returned', detail: 'Sotuv yakunlanmadi', by: user.username, at: new Date() } : undefined);
      // Katalog narxi yozilgan bo'lsa — eski narx tiklanadi
      if (catalogPrice) await m.Product.updateOne({ _id: product._id }, { $set: { salePrice: product.salePrice } });
    };

    const paid = line.parts.reduce((s, p) => s + p.amount, 0);
    const lineBank = line.bankParts && line.bankParts.length > 0 ? line.bankParts : undefined;
    const remaining = saleRemaining(line.total, paid, terms, lineBank);
    // To'lov izohi: naqd sotuvda naqd qism — «Naqd to'lov»; qarz/nasiya/bankda — «Boshlang'ich to'lov»
    const note = (method: string) => (terms.paymentType === 'cash' ? (method === 'cash' ? 'Naqd to\'lov' : undefined) : 'Boshlang\'ich to\'lov');
    let saleId: Types.ObjectId;
    let saleNo: string;
    try {
      saleNo = await generateSaleNo(m.Sale);
      const sale = await m.Sale.create({
        saleNo,
        productId: product._id,
        productSnapshot: {
          name: product.name, imei: product.imei, brand: product.brand, deviceModel: product.deviceModel,
          purchasePrice: product.purchasePrice, saleQuantity: qty, unit: product.unit,
          ...(product.ikpu ? { ikpu: product.ikpu } : {}),
        },
        ...(line.marking?.codes.length ? { markingCodes: line.marking.codes, markingKeys: line.marking.keys } : {}),
        ...(customer ? { ...(customer._id ? { customerId: customer._id } : {}), customerSnapshot: { fullName: customer.fullName, phone: customer.phone } } : {}),
        branchId: product.branchId,
        paymentType: terms.paymentType,
        bankName: lineBank ? bankPartsLabel(lineBank) : undefined,
        bankParts: lineBank,
        totalAmount: line.total,
        paidAmount: paid,
        remainingAmount: remaining,
        installmentMonths: terms.months,
        payDay: terms.payDay,
        // Nasiya boshlang'ich to'lovi = sotuv paytidagi to'langan (oy jadvali shu asosda)
        downPayment: terms.paymentType === 'installment' ? paid : undefined,
        dueDate: remaining > 0 ? terms.dueDate : undefined,
        status: calcSaleStatus(line.total, paid),
        payments: line.parts.filter((p) => p.amount > 0).map((p) => ({ amount: p.amount, paidAt: now, note: note(p.method), recordedBy: user.username, method: p.method })),
        checkoutId: input.checkoutId,
        ...(line.discount ? { discount: line.discount } : {}),
        // Kalit faqat birinchi qatorda (unikal indeks); savatning qolgani — checkoutId orqali
        ...(input.clientSaleId && idx === 0 ? { clientSaleId: input.clientSaleId } : {}),
        soldBy: user.username,
        notes: input.notes || undefined,
        photoUrl: input.photoUrl || undefined,
        ...(input.at ? { createdAt: input.at } : {}),
        ...input.saleExtra,
      });
      saleId = sale._id;
    } catch (err) {
      // Kompensatsiya: sotuv yozilmasa — tovar omborga qaytadi
      await restock();
      if (input.clientSaleId && isDupKey(err)) { duplicate = true; return null; }
      throw err;
    }
    return {
      result: { saleId: String(saleId), saleNo, product, qty, total: line.total, remaining, bankParts: lineBank, discount: line.discount },
      undo: async () => {
        await m.Sale.deleteOne({ _id: saleId });
        await restock(true);
      },
    };
  });

  if (!outcome.ok) {
    if (duplicate) return { ok: false, duplicate: true };
    if (shortOf) return { ok: false, error: { code: 'notEnoughStock', name: input.lines.length > 1 ? shortOf : undefined } };
    return { ok: false, error: { code: 'failed' } };
  }
  return { ok: true, sales: outcome.results };
}

/** Sotuvdan keyin: audit (har qator), egasiga bildirishnoma, onboarding qadami */
export async function afterSales(
  user: SessionUser,
  sales: readonly WrittenSale[],
  info: { terms: SaleTerms; methods: string[]; source: 'web' | 'pos' | 'mobile' | 'quick' | 'mark' | 'offline'; checkoutId?: string; extra?: string },
): Promise<void> {
  const { terms, source } = info;
  const total = sales.reduce((s, r) => s + r.total, 0);
  for (const r of sales) {
    await recordAudit(user, {
      action: 'sale.create',
      entity: 'sale',
      entityId: r.saleId,
      summary: `Sotuv ${r.saleNo}: ${r.product.name} · ${qtyLabel(r.qty, r.product.unit)} · ${r.total.toLocaleString('uz-UZ')} so'm (${terms.paymentType})`
        + `${sales.length > 1 ? ` · xarid ${sales.length} ta tovar` : ''}${r.discount ? ` · chegirma ${r.discount.toLocaleString('uz-UZ')}` : ''}${info.extra ? ` · ${info.extra}` : ''} [${source}]`,
      meta: {
        saleQty: r.qty, totalAmount: r.total, paymentType: terms.paymentType, methods: info.methods, source,
        ...(r.bankParts ? { bankParts: r.bankParts } : {}), ...(info.checkoutId ? { checkoutId: info.checkoutId } : {}),
      },
    });
  }
  if (sales.length) {
    void notifyNewSale(user, {
      saleNo: [...sales.map((s) => s.saleNo)].sort()[0], items: sales.length, firstItem: sales[0].product.name, total,
      payment: salePayLabel(terms.paymentType, info.methods), by: user.username,
    });
    await markOnboardingStep(user.organizationId, 'saleMade');
  }
}

/** Yadro xatosi → matn (joriy til) */
export function saleCoreErrorText(e: SaleCoreError, d: Dict): string {
  const m = d.sales.actions;
  const withName = (name: string | undefined, msg: string) => (name ? `${name}: ${msg}` : msg);
  switch (e.code) {
    case 'notInStock': return e.name ? tr(m.productNotInStock, { name: e.name }) : m.notInStock;
    case 'badQty': return withName(e.name, m.badQty);
    case 'onlyNLeft': return withName(e.name, tr(m.onlyNLeft, { n: qtyWithUnit(e.available, e.unit, d.stock.fields.units) }));
    case 'enterPriceFor': return tr(m.enterPriceFor, { name: e.name });
    case 'notEnoughStock': return e.name ? tr(m.notEnoughStockFor, { name: e.name }) : m.notEnoughStock;
    case 'customer': return m[e.reason];
    case 'markingSold': return tr(d.sales.marking.alreadySold, { code: e.serial });
    case 'marking': {
      const t = d.sales.marking;
      const x = e.error;
      switch (x.code) {
        case 'invalid': return tr(t.invalid, { name: x.name, code: x.value });
        case 'mismatch': return tr(t.mismatch, { name: x.name, code: x.value });
        case 'duplicate': return tr(t.duplicate, { name: x.name, code: x.value });
        case 'tooMany': return tr(t.tooMany, { name: x.name });
        case 'missing': return tr(t.missing, { name: x.name, n: x.n });
        case 'expired': return tr(t.expired, { name: x.name, date: x.date.split('-').reverse().join('.') });
      }
      return m.saleFailed;
    }
    case 'failed': return m.saleFailed;
  }
}
