/**
 * Realizatsiya: tanlangan davrdagi barcha pul harakati (kirim/chiqim) va sotilgan tovarlar.
 * Sof funksiyalar (test qilinadi) + Moliya sahifasi va Excel eksporti uchun umumiy yuklovchi.
 */
import type { Model, Types } from 'mongoose';
import type { ISale, PaymentType } from './models/tenant/Sale';
import type { ICashFlow } from './models/tenant/CashFlow';
import type { IBankReceipt } from './models/tenant/BankReceipt';
import type { ISupplier, ISupplierEntry } from './models/tenant/Supplier';
import type { IBranch } from './models/tenant/Branch';
import type { ProductUnit } from './businessTypes';
import { methodOf, type PayMethod } from './payMethods';
import { defersProfit, profitBetween, saleCost, saleProfitParts } from './saleProfit';

export type MoneyKind = 'salePay' | 'debtPay' | 'bank' | 'income' | 'expense' | 'refund' | 'supplier';

export interface MoneyRow {
  at: Date;
  kind: MoneyKind;
  /** Sotuv raqami, toifa, bank yoki yetkazib beruvchi nomi */
  title: string;
  /** Mahsulot / mijoz / izoh */
  detail: string;
  branchId?: string;
  method?: PayMethod;
  amountIn: number;
  amountOut: number;
  href?: string;
}

export interface SoldRow {
  saleId: string;
  saleNo: string;
  at: Date;
  product: string;
  qty: number;
  unit?: ProductUnit;
  customer: string;
  paymentType: PaymentType;
  branchId: string;
  total: number;
  cost: number;
  profit: number;
}

type SaleLike = Pick<ISale, 'saleNo' | 'status' | 'paymentType' | 'payments' | 'returns' | 'totalAmount' | 'createdAt' | 'customerSnapshot' | 'productSnapshot'>
  & Partial<Pick<ISale, 'bankName' | 'bankParts' | 'paidAmount' | 'remainingAmount'>> & {
  _id: unknown;
  branchId: unknown;
  cancelledAt?: Date | null;
};

const inRange = (d: Date, start: Date, end: Date) => d >= start && d < end;

/**
 * To'lovlari pul harakatida qoladigan sotuv: bekor qilinmagan yoki yangi tartibda bekor qilingan (`cancelledAt` bor —
 * to'lov realizatsiya, mijozga qaytarilgani Moliya chiqimi bo'lib alohida yoziladi). Eski bekor qilinganlar — hisobdan tashqari.
 */
function paymentsCount(s: { status: string; cancelledAt?: unknown }): boolean {
  return s.status !== 'cancelled' || !!s.cancelledAt;
}
/** Sotuv paytida olingan to'lov (naqd sotuv yoki bosh to'lov) — keyingi qarz/nasiya to'lovlaridan ajratish uchun */
const INITIAL_NOTES = new Set(["Naqd to'lov", "Boshlang'ich to'lov"]);
const INITIAL_WINDOW_MS = 5 * 60 * 1000;

/** Sotuvlardagi to'lovlar (kirim) va qisman qaytarishda mijozga naqd qaytarilgan pul (chiqim) — kassa bilan bir xil qoida */
export function moneyRowsFromSales(sales: SaleLike[], start: Date, end: Date): MoneyRow[] {
  const rows: MoneyRow[] = [];
  for (const s of sales) {
    if (!paymentsCount(s)) continue;
    const id = String(s._id);
    const branchId = String(s.branchId);
    const detail = [s.productSnapshot?.name, s.customerSnapshot?.fullName].filter(Boolean).join(' · ');
    const created = s.createdAt ? new Date(s.createdAt).getTime() : null;
    for (const p of s.payments ?? []) {
      const at = new Date(p.paidAt);
      if (!inRange(at, start, end) || !(p.amount > 0)) continue;
      const initial = s.paymentType === 'cash'
        || (p.note && INITIAL_NOTES.has(p.note))
        || (created !== null && Math.abs(at.getTime() - created) < INITIAL_WINDOW_MS);
      rows.push({
        at, kind: initial ? 'salePay' : 'debtPay', title: s.saleNo, detail, branchId,
        method: methodOf(p), amountIn: p.amount, amountOut: 0, href: `/app/sales/${id}`,
      });
    }
    for (const r of s.returns ?? []) {
      const at = new Date(r.returnedAt);
      if (!inRange(at, start, end) || !(r.refundAmount > 0)) continue;
      rows.push({ at, kind: 'refund', title: s.saleNo, detail, branchId, method: 'cash', amountIn: 0, amountOut: r.refundAmount, href: `/app/sales/${id}` });
    }
  }
  return rows;
}

/** Moliya yozuvlari: boshqa kirimlar, xarajatlar, kassaga qo'shish/olish */
export function moneyRowsFromFlows(
  flows: (Pick<ICashFlow, 'type' | 'amount' | 'description' | 'category' | 'createdAt'> & { _id: unknown; branchId?: unknown; saleId?: unknown })[],
  start: Date,
  end: Date,
): MoneyRow[] {
  return flows.flatMap((f) => {
    const at = f.createdAt ? new Date(f.createdAt) : null;
    if (!at || !inRange(at, start, end) || !(f.amount > 0)) return [];
    const income = f.type === 'income';
    const category = f.category?.trim();
    // Sotuv bekor qilinganda mijozga qaytarilgan pul (saleId bilan yoziladi) — «qaytarish»
    const refund = !income && !!f.saleId;
    return [{
      at, kind: refund ? 'refund' : income ? 'income' : 'expense', title: category || f.description, detail: category && f.description !== category ? f.description : '',
      branchId: f.branchId ? String(f.branchId) : undefined,
      amountIn: income ? f.amount : 0, amountOut: income ? 0 : f.amount, href: refund ? `/app/sales/${String(f.saleId)}` : '/app/finance',
    } satisfies MoneyRow];
  });
}

/** Davrda bankdan olingan pul — bank krediti ulushi foydaga shu summa bilan kiradi */
export function bankInOf(money: MoneyRow[]): number {
  return money.reduce((a, r) => a + (r.kind === 'bank' ? r.amountIn : 0), 0);
}

/** Bankdan olingan pul (bank krediti sotuvlari uchun) */
export function moneyRowsFromReceipts(
  receipts: (Pick<IBankReceipt, 'bankName' | 'amount' | 'receivedAt' | 'note'> & { branchId?: unknown })[],
  start: Date,
  end: Date,
): MoneyRow[] {
  return receipts.flatMap((r) => {
    const at = new Date(r.receivedAt);
    if (!inRange(at, start, end)) return [];
    return [{
      at, kind: 'bank', title: r.bankName, detail: r.note ?? '', branchId: r.branchId ? String(r.branchId) : undefined,
      amountIn: r.amount, amountOut: 0, href: '/app/kredit-kassa',
    } satisfies MoneyRow];
  });
}

/** Yetkazib beruvchiga to'lovlar (chiqim). Tovar olish (purchase) pul harakati emas — u qarz */
export function moneyRowsFromSupplier(
  entries: (Pick<ISupplierEntry, 'type' | 'amount' | 'at' | 'note'> & { supplierId: unknown })[],
  supplierNames: Map<string, string>,
  start: Date,
  end: Date,
): MoneyRow[] {
  return entries.flatMap((e) => {
    const at = new Date(e.at);
    if (e.type !== 'payment' || !inRange(at, start, end)) return [];
    const id = String(e.supplierId);
    return [{
      at, kind: 'supplier', title: supplierNames.get(id) ?? '—', detail: e.note ?? '',
      amountIn: 0, amountOut: e.amount, href: `/app/suppliers/${id}`,
    } satisfies MoneyRow];
  });
}

export function sumMoney(rows: MoneyRow[]): { in: number; out: number; net: number } {
  let i = 0;
  let o = 0;
  for (const r of rows) { i += r.amountIn; o += r.amountOut; }
  return { in: i, out: o, net: i - o };
}

/**
 * Davrda yaratilgan (bekor qilinmagan) sotuvlar: summa, tannarx va foyda — Hisobotdagi foyda bilan bir xil formula:
 * bank krediti ulushi sotuv foydasiga kirmaydi (u bankdan pul olinganda — `bankInOf`);
 * nasiya foydasi — tannarx qoplangach davr oxirigacha kelgan to'lovlardan (lib/saleProfit.ts).
 */
export function soldRows(sales: SaleLike[], start: Date, end: Date): SoldRow[] {
  return sales.flatMap((s) => {
    if (s.status === 'cancelled' || !s.createdAt) return [];
    const at = new Date(s.createdAt);
    if (!inRange(at, start, end)) return [];
    const qty = s.productSnapshot?.saleQuantity ?? 1;
    const cost = saleCost(s);
    return [{
      saleId: String(s._id), saleNo: s.saleNo, at, product: s.productSnapshot?.name ?? '—', qty,
      unit: s.productSnapshot?.unit, customer: s.customerSnapshot?.fullName ?? '', paymentType: s.paymentType,
      branchId: String(s.branchId), total: s.totalAmount, cost, profit: profitBetween(saleProfitParts(s, cost), start, end),
    }];
  });
}

/**
 * Davrdan oldin sotilgan nasiyalarning shu davrdagi to'lovlaridan foyda (tannarx qoplangach) — Realizatsiya
 * «Foyda» kartasida sotilgan tovarlar foydasiga qo'shiladi (Hisobot bilan bir qoida).
 */
export function earlierNasiyaProfit(sales: SaleLike[], start: Date, end: Date): number {
  let sum = 0;
  for (const s of sales) {
    if (s.status === 'cancelled' || !defersProfit(s) || !s.createdAt || new Date(s.createdAt) >= start) continue;
    const cost = saleCost(s);
    sum += profitBetween(saleProfitParts(s, cost), start, end);
  }
  return sum;
}

/** Bir davr uchun barcha manbalarni yuklaydi (Moliya → Realizatsiya va Excel eksporti) */
export async function loadRealization(
  m: {
    Sale: Model<ISale>;
    CashFlow: Model<ICashFlow>;
    BankReceipt: Model<IBankReceipt>;
    SupplierEntry: Model<ISupplierEntry>;
    Supplier: Model<ISupplier>;
    Branch: Model<IBranch>;
  },
  start: Date,
  end: Date,
): Promise<{ money: MoneyRow[]; sold: SoldRow[]; branchNames: Map<string, string>; nasiyaEarlier: number }> {
  const range = { $gte: start, $lt: end };
  const [sales, flows, receipts, entries, branches] = await Promise.all([
    m.Sale.find({
      $and: [
        { $or: [{ status: { $ne: 'cancelled' } }, { cancelledAt: { $exists: true } }] },
        { $or: [{ createdAt: range }, { 'payments.paidAt': range }, { 'returns.returnedAt': range }] },
      ],
    })
      .select('saleNo status paymentType payments returns totalAmount createdAt customerSnapshot productSnapshot branchId cancelledAt bankName bankParts paidAmount remainingAmount')
      .limit(20000)
      .lean(),
    m.CashFlow.find({ createdAt: range }).select('type amount description category createdAt branchId saleId').limit(20000).lean(),
    m.BankReceipt.find({ receivedAt: range }).select('bankName amount receivedAt note branchId').limit(20000).lean(),
    m.SupplierEntry.find({ type: 'payment', at: range }).select('type amount at note supplierId').limit(20000).lean(),
    m.Branch.find().select('name').lean(),
  ]);
  const supplierIds = [...new Set(entries.map((e) => String(e.supplierId)))];
  const suppliers = supplierIds.length
    ? await m.Supplier.find({ _id: { $in: supplierIds as unknown as Types.ObjectId[] } }).select('name').lean()
    : [];
  const supplierNames = new Map(suppliers.map((x) => [String(x._id), x.name]));

  const money = [
    ...moneyRowsFromSales(sales as SaleLike[], start, end),
    ...moneyRowsFromFlows(flows, start, end),
    ...moneyRowsFromReceipts(receipts, start, end),
    ...moneyRowsFromSupplier(entries, supplierNames, start, end),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  const sold = soldRows(sales as SaleLike[], start, end).sort((a, b) => b.at.getTime() - a.at.getTime());
  return {
    money, sold, branchNames: new Map(branches.map((b) => [String(b._id), b.name])),
    nasiyaEarlier: earlierNasiyaProfit(sales as SaleLike[], start, end),
  };
}
