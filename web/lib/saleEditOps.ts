import type { Types } from 'mongoose';
import type { getTenantModels } from './tenantDb';
import type { SessionUser } from './session';
import type { ISaleEditChange, ISaleReturn } from './models/tenant/Sale';
import { branchFilter } from './branchScope';
import { recordAudit } from './audit';
import { computeInstallmentPlan } from './installment';
import { resolveSaleCustomer, type SaleCustomerError } from './saleCustomer';
import { computePriceEdit, computeProductSwap, respreadInstallmentAmounts, type PriceEditCalc, type PriceEditError, type SwapCalc, type SwapError, type SwapSettle } from './saleEdit';
import type { IProduct } from './models/tenant/Product';
import type { PayMethod } from './payMethods';
import { bankPartsTotal, saleBankParts } from './bankCredit';
import { checkSaleQty } from './productQuantity';
import { priceTimesQty, qtyLabel } from './qty';
import { reserveStock, releaseStock } from './stock';
import { markingModeOf } from './marking';
import { getShopSettings } from './shopSettings';

/**
 * Sotuvni tahrirlash — web (editSaleAction) va mobil (PATCH /api/mobile/sales/[id]) uchun umumiy.
 * Huquq chaqiruvchida: «sale.edit»; narx uchun qo'shimcha «sale.editPrice» (`canEditPrice`).
 *
 * Maydonlar (undefined — o'zgarmaydi):
 *  - customer: mijoz (ro'yxatdan tanlangan id yoki ism + telefon); null — olib tashlash (faqat qoldiqsiz naqd sotuvda).
 *    Bitta xariddagi (checkoutId) barcha tovarlarga qo'llanadi — xarid bir mijozniki bo'lib qoladi.
 *  - notes: izoh ('' — o'chirish)
 *  - dueDate: qarz muddati (null — olib tashlash) — faqat qarz / qoldiqli naqd sotuvda (nasiyada jadval bo'yicha)
 *  - totalAmount: narx — pul qoidasi lib/saleEdit (oshsa — qoldiqqa, kamaysa — avval qarzdan, ortig'i naqd qaytariladi)
 *  - product: tovarni almashtirish (shu miqdorda) — eski tovar omborga qaytadi, yangisi ayiriladi. Summa — yangi tovar
 *    narxi × miqdor (yoki `totalAmount`, «sale.editPrice» bilan). Farq: `settle` 'now' — mijoz hozir to'laydi
 *    (`method` bilan to'lov yoziladi), 'debt' — qoldiqqa; arzonlashsa — avval qarzdan, ortig'i naqd qaytariladi.
 *    Bank ulushi o'zgarmaydi (lib/saleEdit computeProductSwap).
 */
type AllModels = Awaited<ReturnType<typeof getTenantModels>>;
type Models = Pick<AllModels, 'Sale' | 'Customer'> & Partial<Pick<AllModels, 'Product' | 'ShopSettings'>>;
type ProductDoc = IProduct & { _id: Types.ObjectId };

export interface SaleEditInput {
  customer?: { id?: string; name: string; phone: string } | null;
  notes?: string;
  dueDate?: Date | null;
  totalAmount?: number;
  product?: { id: string; settle: SwapSettle; method?: PayMethod };
}

export type SaleEditError =
  | 'notFound' | 'noChanges' | 'conflict' | 'pricePerm' | 'customerRequired' | 'dueNotAllowed' | 'badDate'
  | Exclude<PriceEditError, 'same'> | SwapError | SaleCustomerError
  | 'swapSame' | 'swapNotInStock' | 'swapQty' | 'swapMarked' | 'swapNoPrice';

export type SaleEditResult =
  | { ok: true; saleNo: string; changes: ISaleEditChange[]; price: PriceEditCalc | null; swap: SwapCalc | null; siblings: number }
  | { ok: false; error: SaleEditError };

export const SALE_NOTES_MAX = 500;
const SNAP_MAX = 300;

const dayKey = (d?: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const custLabel = (c?: { fullName?: string; phone?: string } | null) =>
  c?.fullName || c?.phone ? [c.fullName, c.phone].filter(Boolean).join(' · ') : '';
const snap = (s: string) => s.slice(0, SNAP_MAX);
const sum = (n: number) => n.toLocaleString('uz-UZ');

export async function editSale(
  m: Models,
  user: SessionUser,
  saleId: string,
  input: SaleEditInput,
  opts: { canEditPrice: boolean },
): Promise<SaleEditResult> {
  const scope = branchFilter(user);
  const sale = await m.Sale.findOne({ _id: saleId, ...scope }).lean();
  if (!sale) return { ok: false, error: 'notFound' };
  if (sale.status === 'cancelled') return { ok: false, error: 'cancelled' };

  const changes: ISaleEditChange[] = [];
  const set: Record<string, unknown> = {};
  const unset: Record<string, ''> = {};
  let price: PriceEditCalc | null = null;
  let swap: { calc: SwapCalc; product: ProductDoc; qty: number; method: PayMethod } | null = null;
  const oldQty = sale.productSnapshot?.saleQuantity ?? 1;

  // 0) Tovarni almashtirish (summa ham shu yerda — 1-qadam o'tkazib yuboriladi)
  if (input.product) {
    if (!m.Product || !m.ShopSettings) return { ok: false, error: 'swapNotInStock' };
    // Markirovka kodlari eski tovarniki — almashtirilsa chek/kodlar noto'g'ri bo'ladi
    if (sale.markingKeys?.length) return { ok: false, error: 'swapMarked' };
    if (String(sale.productId) === input.product.id) return { ok: false, error: 'swapSame' };
    const product = await m.Product.findOne({ _id: input.product.id, ...scope }).lean<ProductDoc>();
    // Ombor va kassa filial bo'yicha — yangi tovar sotuv filialidan bo'lishi kerak
    if (!product || product.status !== 'in_stock' || String(product.branchId) !== String(sale.branchId)) {
      return { ok: false, error: 'swapNotInStock' };
    }
    const marked = (product.kind ?? 'goods') === 'goods' && !!product.marked;
    if (marked && markingModeOf((await getShopSettings(m.ShopSettings)).stock?.markingMode) === 'require') {
      return { ok: false, error: 'swapMarked' };
    }
    const q = checkSaleQty(product, oldQty);
    if (!q.ok) return { ok: false, error: 'swapQty' };
    let newTotal = priceTimesQty(product.salePrice, q.qty);
    if (input.totalAmount !== undefined && input.totalAmount !== newTotal) {
      if (!opts.canEditPrice) return { ok: false, error: 'pricePerm' };
      newTotal = input.totalAmount;
    }
    if (!(newTotal >= 1)) return { ok: false, error: 'swapNoPrice' };
    const plan = sale.paymentType === 'installment' ? computeInstallmentPlan(sale) : null;
    const bank = bankPartsTotal(saleBankParts(sale));
    const r = computeProductSwap({
      totalAmount: sale.totalAmount,
      paidAmount: sale.paidAmount,
      remainingAmount: sale.remainingAmount,
      paymentType: sale.paymentType,
      status: sale.status,
      bank,
      downPayment: plan?.down ?? 0,
    }, newTotal, input.product.settle);
    if (!r.ok) return { ok: false, error: r.error };
    const c = r.calc;
    swap = { calc: c, product, qty: q.qty, method: input.product.method ?? 'cash' };
    set.productId = product._id;
    set.productSnapshot = {
      name: product.name, imei: product.imei, brand: product.brand, deviceModel: product.deviceModel,
      purchasePrice: product.purchasePrice, saleQuantity: q.qty, unit: product.unit,
      ...(product.ikpu ? { ikpu: product.ikpu } : {}),
    };
    // Chegirma eski tovar narxidan edi
    if (sale.discount) unset.discount = '';
    changes.push({ field: 'product', from: snap(sale.productSnapshot?.name ?? ''), to: snap(product.name) });
    if (c.delta !== 0) {
      set.totalAmount = c.newTotal;
      set.paidAmount = c.newPaid;
      set.remainingAmount = c.newRemaining;
      set.status = c.newStatus;
      if (c.newDown !== undefined) set.downPayment = c.newDown;
      if (plan && c.newDown === undefined) {
        // Moliyalangan summa o'zgardi: to'langan oylar qoladi, farq to'lanmagan oylarga
        const amounts = respreadInstallmentAmounts(plan.schedule, c.newTotal - bank - plan.down);
        if (amounts) set.installmentAmounts = amounts;
        else unset.installmentAmounts = '';
      }
      changes.push({ field: 'totalAmount', from: String(sale.totalAmount), to: String(c.newTotal) });
    }
  }

  // 1) Narx
  if (!swap && input.totalAmount !== undefined && input.totalAmount !== sale.totalAmount) {
    if (!opts.canEditPrice) return { ok: false, error: 'pricePerm' };
    const plan = sale.paymentType === 'installment' ? computeInstallmentPlan(sale) : null;
    const r = computePriceEdit({
      totalAmount: sale.totalAmount,
      paidAmount: sale.paidAmount,
      remainingAmount: sale.remainingAmount,
      paymentType: sale.paymentType,
      status: sale.status,
      bankParts: sale.bankParts,
      downPayment: plan?.down ?? 0,
    }, input.totalAmount);
    if (!r.ok) {
      if (r.error !== 'same') return { ok: false, error: r.error };
    } else {
      price = r.calc;
      set.totalAmount = price.newTotal;
      set.paidAmount = price.newPaid;
      set.remainingAmount = price.newRemaining;
      set.status = price.newStatus;
      if (plan) {
        // Nasiya: to'langan oylar o'zgarmaydi, farq to'lanmagan oylarga (bo'lolmasa — jadval teng bo'linadi)
        const amounts = respreadInstallmentAmounts(plan.schedule, price.newTotal - plan.down);
        if (amounts) set.installmentAmounts = amounts;
        else unset.installmentAmounts = '';
      }
      changes.push({ field: 'totalAmount', from: String(sale.totalAmount), to: String(price.newTotal) });
    }
  }
  const remainingAfter = swap ? swap.calc.newRemaining : price ? price.newRemaining : sale.remainingAmount;

  // 2) Mijoz
  let customerSet: { customerId: Types.ObjectId; customerSnapshot: { fullName: string; phone: string } } | null = null;
  let customerCleared = false;
  if (input.customer !== undefined) {
    const before = custLabel(sale.customerSnapshot);
    if (input.customer === null) {
      if (sale.customerId || before) {
        // Qarz/nasiya yoki qoldiq bor — mijozsiz qolmaydi
        if (sale.paymentType !== 'cash' || remainingAfter > 0) return { ok: false, error: 'customerRequired' };
        customerCleared = true;
        changes.push({ field: 'customer', from: snap(before), to: '' });
      }
    } else {
      const res = await resolveSaleCustomer(m, input.customer);
      if (!res.ok) return { ok: false, error: res.error };
      const c = res.customer;
      // Ism va telefon (raqamlari) bir xil — o'zgarish emas: telefon formati farqi ham, eski (mijozga
      // bog'lanmagan) sotuv ham shunday qoladi
      const digitsOf = (v?: string) => (v ?? '').replace(/\D/g, '').slice(-9);
      const same = (sale.customerSnapshot?.fullName ?? '').trim() === c.fullName.trim()
        && digitsOf(sale.customerSnapshot?.phone) === digitsOf(c.phone)
        && (!sale.customerId || String(sale.customerId) === String(c._id));
      if (!same) {
        customerSet = { customerId: c._id, customerSnapshot: { fullName: c.fullName, phone: c.phone } };
        changes.push({ field: 'customer', from: snap(before), to: snap(custLabel(c)) });
      }
    }
  }
  if (customerSet) Object.assign(set, customerSet);
  if (customerCleared) { unset.customerId = ''; unset.customerSnapshot = ''; }

  // 3) Izoh
  if (input.notes !== undefined) {
    const next = input.notes.trim().slice(0, SALE_NOTES_MAX);
    const prev = sale.notes ?? '';
    if (next !== prev) {
      if (next) set.notes = next;
      else unset.notes = '';
      changes.push({ field: 'notes', from: snap(prev), to: snap(next) });
    }
  }

  // 4) Qarz muddati
  if (input.dueDate !== undefined) {
    const next = input.dueDate;
    if (next && (Number.isNaN(next.getTime()) || next.getUTCFullYear() < 2000 || next.getUTCFullYear() > 2100)) {
      return { ok: false, error: 'badDate' };
    }
    if (dayKey(next) !== dayKey(sale.dueDate)) {
      // Nasiyada muddat — oylik jadvaldan; bank kreditida — bank bilan; to'langan sotuvda muddat yo'q (olib tashlash mumkin)
      const allowed = (sale.paymentType === 'debt' || sale.paymentType === 'cash') && (remainingAfter > 0 || !next);
      if (!allowed) return { ok: false, error: 'dueNotAllowed' };
      if (next) set.dueDate = next;
      else unset.dueDate = '';
      changes.push({ field: 'dueDate', from: dayKey(sale.dueDate), to: dayKey(next) });
    }
  }

  if (changes.length === 0) return { ok: false, error: 'noChanges' };

  const now = new Date();
  const edit = { at: now, by: user.username, changes };
  const push: Record<string, unknown> = { edits: edit };
  const money = swap?.calc ?? price;
  if (money && money.refundAmount > 0) {
    // Ortiqcha to'langan pul mijozga naqd — kassa/kirim-chiqim/foyda buni qaytarish kabi hisoblaydi (lib/kassa)
    const ret: ISaleReturn = {
      kind: 'price',
      qty: 0,
      amount: -money.delta,
      debtReduced: money.debtReduced,
      refundAmount: money.refundAmount,
      reason: swap
        ? `Tovar almashtirildi: ${sale.productSnapshot?.name ?? ''} → ${swap.product.name} (${sum(sale.totalAmount)} → ${sum(money.newTotal)} so'm)`.slice(0, 300)
        : `Narx o'zgartirildi: ${sum(sale.totalAmount)} → ${sum(money.newTotal)} so'm`,
      returnedAt: now,
      by: user.username,
    };
    push.returns = ret;
  }
  if (swap && swap.calc.collectNow > 0) {
    // Farqni mijoz hozir to'ladi — kassaga bugun, tanlangan usul bilan
    push.payments = {
      amount: swap.calc.collectNow,
      paidAt: now,
      note: 'Tovar almashtirildi — farq',
      recordedBy: user.username,
      method: swap.method,
      balanceAfter: swap.calc.newRemaining,
    };
  }

  // Yangi tovar ombordan (atomik); sotuv yozilmasa — qaytariladi
  if (swap) {
    const reserved = await reserveStock(m.Product!, swap.product._id, swap.qty, {
      scope,
      history: { action: 'sold', detail: `Sotuv ${sale.saleNo}: ${qtyLabel(swap.qty, swap.product.unit)} (${sale.productSnapshot?.name ?? ''} o'rniga)`.slice(0, 300), by: user.username, at: now },
    });
    if (!reserved) return { ok: false, error: 'swapNotInStock' };
  }

  // Optimistik qulf: o'qilgandan beri to'lov/qaytarish bo'lmagan bo'lsagina yoziladi
  const updated = await m.Sale.findOneAndUpdate(
    {
      _id: sale._id,
      ...scope,
      status: { $ne: 'cancelled' },
      totalAmount: sale.totalAmount,
      paidAmount: sale.paidAmount,
      remainingAmount: sale.remainingAmount,
      productId: sale.productId,
    },
    {
      ...(Object.keys(set).length ? { $set: set } : {}),
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
      $push: push,
    },
    { new: true, projection: { _id: 1 } },
  ).lean();
  if (!updated) {
    if (swap) await releaseStock(m.Product!, swap.product._id, swap.qty, { action: 'returned', detail: `Sotuv ${sale.saleNo}: almashtirish yakunlanmadi`, by: user.username, at: new Date() });
    return { ok: false, error: 'conflict' };
  }
  // Eski tovar omborga
  if (swap && sale.productId) {
    await releaseStock(m.Product!, sale.productId, oldQty, {
      action: 'returned',
      detail: `Sotuv ${sale.saleNo}: tovar almashtirildi → ${swap.product.name}`.slice(0, 300),
      by: user.username,
      at: new Date(),
    });
  }

  // Bitta xarid — bitta mijoz: qolgan tovarlarga ham (tarixda shu o'zgarish bilan)
  let siblings = 0;
  if ((customerSet || customerCleared) && sale.checkoutId) {
    const custChange = changes.filter((c) => c.field === 'customer');
    const r = await m.Sale.updateMany(
      { checkoutId: sale.checkoutId, _id: { $ne: sale._id }, ...scope },
      {
        ...(customerSet ? { $set: customerSet } : { $unset: { customerId: '', customerSnapshot: '' } }),
        $push: { edits: { at: now, by: user.username, changes: custChange } },
      },
    );
    siblings = r.modifiedCount ?? 0;
  }

  const parts = changes.map((c) => {
    if (c.field === 'product') return `tovar: ${c.from || '—'} → ${c.to || '—'}`;
    if (c.field === 'totalAmount') {
      const extra = money && money.refundAmount > 0 ? ` (mijozga qaytarildi ${sum(money.refundAmount)} so'm)`
        : swap && swap.calc.collectNow > 0 ? ` (mijoz to'ladi ${sum(swap.calc.collectNow)} so'm, ${swap.method})`
        : swap && swap.calc.addedToDebt > 0 ? ` (qarzga ${sum(swap.calc.addedToDebt)} so'm)` : '';
      return `narx ${sum(Number(c.from))} → ${sum(Number(c.to))} so'm${extra}`;
    }
    if (c.field === 'customer') return `mijoz: ${c.from || '—'} → ${c.to || '—'}${siblings ? ` (xariddagi yana ${siblings} ta tovar)` : ''}`;
    if (c.field === 'dueDate') return `muddat: ${c.from || '—'} → ${c.to || '—'}`;
    return 'izoh';
  });
  await recordAudit(user, {
    action: 'sale.edit',
    entity: 'sale',
    entityId: String(sale._id),
    summary: `Sotuv tahrirlandi: ${sale.saleNo} · ${parts.join(' · ')}`,
    meta: {
      changes,
      ...(money ? { delta: money.delta, refundAmount: money.refundAmount, debtReduced: money.debtReduced, remaining: money.newRemaining } : {}),
      ...(swap ? { productFrom: String(sale.productId), productTo: String(swap.product._id), collectNow: swap.calc.collectNow, addedToDebt: swap.calc.addedToDebt, method: swap.method } : {}),
      ...(siblings ? { siblings } : {}),
    },
  });

  return { ok: true, saleNo: sale.saleNo, changes, price, swap: swap?.calc ?? null, siblings };
}
