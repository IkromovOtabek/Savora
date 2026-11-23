import { ISale } from './models/tenant/Sale';
import type { CashFlowType } from './models/tenant/CashFlow';
import { categoryInProfit, type IFinanceCategory } from './models/tenant/FinanceCategory';
import { splitBankReceipts } from './bankCredit';
import type { ProfitPart } from './saleProfit';

export interface PeriodStats {
  salesCount: number;
  revenue: number;
  paid: number;
  debt: number;
  profit: number;
}

export function statsFromSales(sales: (ISale & { productSnapshot: { purchasePrice?: number } })[], start: Date, end: Date): PeriodStats {
  let salesCount = 0;
  let revenue = 0;
  let paid = 0;
  let debt = 0;
  let profit = 0;

  for (const s of sales) {
    if (s.status === 'cancelled') continue;
    const created = new Date(s.createdAt!);
    if (created < start || created >= end) continue;
    salesCount++;
    revenue += s.totalAmount;
    paid += s.paidAmount;
    debt += s.remainingAmount;
    const cost = s.productSnapshot.purchasePrice ?? 0;
    const qty = s.productSnapshot.saleQuantity ?? 1;
    profit += s.totalAmount - cost * qty;
  }

  return { salesCount, revenue, paid, debt, profit };
}

/** Moliya yozuvlarining foydaga ta'sir qiluvchi qismi */
export interface OpexSums {
  /** Boshqa kirimlar (sotuvdan tashqari) */
  income: number;
  /** Xarajatlar */
  expense: number;
}

export interface OpexCategoryRow {
  type: CashFlowType;
  category: string;
  total: number;
}

export interface Opex extends OpexSums {
  /** Filial bo'yicha (branchId → summalar) */
  byBranch: Map<string, OpexSums>;
  /** Filialga bog'lanmagan yozuvlar */
  unbranched: OpexSums;
  /** Toifalar bo'yicha, kattasidan kichigiga */
  byCategory: OpexCategoryRow[];
}

type FlowLike = { type: CashFlowType; amount: number; category?: string | null; branchId?: { toString(): string } | string | null };
type CategoryLike = Pick<IFinanceCategory, 'name' | 'type' | 'system' | 'inProfit'>;

/**
 * Sof foyda uchun kirim/chiqim yozuvlari (sof funksiya — test qilinadi).
 * Faqat foydaga ta'sir qiluvchi toifadagi yozuvlar olinadi: toifasiz eski yozuvlar (ko'pincha filialdan
 * pul olish), kassa operatsiyalari va «Investitsiya» hisobga kirmaydi.
 * Sof foyda = yalpi foyda + income − expense.
 */
export function opexFromFlows(flows: FlowLike[], categories: CategoryLike[]): Opex {
  const counted = new Set(categories.filter(categoryInProfit).map((c) => `${c.type}:${c.name}`));
  const byBranch = new Map<string, OpexSums>();
  const unbranched: OpexSums = { income: 0, expense: 0 };
  const byCat = new Map<string, OpexCategoryRow>();
  let income = 0;
  let expense = 0;

  for (const f of flows) {
    const category = f.category?.trim();
    if (!category || !(f.amount > 0)) continue;
    const key = `${f.type}:${category}`;
    if (!counted.has(key)) continue;

    const branchId = f.branchId ? String(f.branchId) : null;
    let sums = unbranched;
    if (branchId) {
      sums = byBranch.get(branchId) ?? { income: 0, expense: 0 };
      byBranch.set(branchId, sums);
    }
    sums[f.type] += f.amount;
    if (f.type === 'income') income += f.amount;
    else expense += f.amount;

    const row = byCat.get(key) ?? { type: f.type, category, total: 0 };
    row.total += f.amount;
    byCat.set(key, row);
  }

  const byCategory = [...byCat.values()].sort((a, b) => b.total - a.total);
  return { income, expense, byBranch, unbranched, byCategory };
}

export function monthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { start, end };
}

/** Foyda hisobi uchun sotuv qatori: tushum (bank ulushisiz — saleProfitRevenue) va tannarx (dona × xarid narxi) */
export interface ProfitSaleLine {
  branchId: string;
  revenue: number;
  cost: number;
  /** Sotuv sanasi — tushum/tannarx shu davrda bo'lsa hisobga kiradi */
  at: Date;
  /**
   * Foyda bo'laklari (`saleProfitParts`): nasiyada tannarx qoplangach to'lov kunlari. Yo'q bo'lsa — sotuv kuni
   * revenue − cost. Oldingi oyda sotilgan nasiyaning shu oydagi to'lovlari ham shu yerda (at davrdan tashqarida).
   */
  parts?: ProfitPart[];
}

/** Eng katta xarajat toifasi — «nima uchun» */
export interface ProfitReason {
  category: string;
  amount: number;
}

export interface ProfitBranchRow {
  /** null — filialsiz yoki nofaol filial yozuvlari */
  id: string | null;
  name: string;
  gross: number;
  income: number;
  expense: number;
  net: number;
  top: ProfitReason | null;
}

export interface ProfitDay {
  /** YYYY-MM-DD (server mahalliy vaqti — monthRange bilan bir xil) */
  day: string;
  gross: number;
  income: number;
  expense: number;
  net: number;
  top: ProfitReason | null;
}

/** Bankdan olingan pul (BankReceipt) — olingan kuni to'liq foydaga kiradi */
export interface ProfitBankReceipt {
  amount: number;
  branchId?: { toString(): string } | string | null;
  at: Date;
}

export interface ProfitReport {
  /** Sotuv tushumi, bank ulushisiz (bank ulushi pul olinganda foydaga kiradi) */
  revenue: number;
  cost: number;
  /** Davrda bankdan olingan pul */
  bankReceived: number;
  /** Shu davr nasiya sotuvlarining hali foydaga kirmagan foydasi (tannarx to'lanmaguncha kutiladi) */
  nasiyaDeferred: number;
  /** Davrdagi nasiya to'lovlaridan foyda (tannarx qoplangach; oldingi oylar sotuvlari ham) */
  nasiyaRecognized: number;
  /** Yalpi foyda = tushum − tannarx − nasiya kutilayotgan + nasiya to'lovlaridan + bankdan olingan */
  gross: number;
  /** Boshqa kirimlar (foydaga kiruvchi toifalar) */
  otherIncome: number;
  /** Xarajatlar (foydaga kiruvchi toifalar) */
  expense: number;
  /** Sof foyda = yalpi + boshqa kirim − xarajat (web «Foyda hisobi» bilan bir formula) */
  net: number;
  byCategory: OpexCategoryRow[];
  byBranch: ProfitBranchRow[];
  /** Davrning har kuni (bo'sh kunlar ham) — yig'indisi net ga teng */
  daily: ProfitDay[];
}

type ProfitFlowLike = FlowLike & { createdAt?: Date | null };

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Toifa → summa xaritasidan eng kattasi */
function topOf(m: Map<string, number> | undefined): ProfitReason | null {
  let top: ProfitReason | null = null;
  for (const [category, amount] of m ?? []) if (!top || amount > top.amount) top = { category, amount };
  return top;
}

/**
 * Sof foyda hisoboti (sof funksiya). Yalpi foyda faqat ro'yxatdagi (faol) filiallar sotuvidan —
 * web Hisobot sahifasi kabi; filialsiz va nofaol filial yozuvlari alohida qatorda (id: null).
 * Filial va kun bo'yicha yig'indilar umumiy sof foydaga teng.
 */
export function profitReport(input: {
  lines: ProfitSaleLine[];
  flows: ProfitFlowLike[];
  categories: CategoryLike[];
  branches: { id: string; name: string }[];
  receipts?: ProfitBankReceipt[];
  start: Date;
  end: Date;
}): ProfitReport {
  const { lines, flows, categories, branches, receipts = [], start, end } = input;
  const listed = new Map(branches.map((b) => [b.id, b.name]));

  const days = new Map<string, ProfitDay>();
  for (const d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const k = dayKey(d);
    days.set(k, { day: k, gross: 0, income: 0, expense: 0, net: 0, top: null });
  }
  const dayOf = (at: Date | null | undefined) => (at ? days.get(dayKey(new Date(at))) : undefined);

  const grossBy = new Map<string, number>();
  const inPeriod = (at: Date) => at >= start && at < end;
  let revenue = 0;
  let cost = 0;
  let saleProfit = 0;
  let nasiyaRecognized = 0;
  for (const l of lines) {
    if (!listed.has(l.branchId)) continue;
    if (inPeriod(l.at)) {
      revenue += l.revenue;
      cost += l.cost;
    }
    for (const p of l.parts ?? [{ at: l.at, amount: l.revenue - l.cost, kind: 'sale' as const }]) {
      if (!inPeriod(p.at)) continue;
      if (p.kind === 'nasiya') nasiyaRecognized += p.amount;
      else saleProfit += p.amount;
      grossBy.set(l.branchId, (grossBy.get(l.branchId) ?? 0) + p.amount);
      const day = dayOf(p.at);
      if (day) day.gross += p.amount;
    }
  }
  const nasiyaDeferred = revenue - cost - saleProfit;
  // Bank puli: filialga web Hisobot qoidasi bilan (splitBankReceipts), filialsiz qoldiq — «Umumiy» qatorida
  const bank = splitBankReceipts(receipts, branches.map((b) => b.id));
  for (const [bid, amount] of bank.byBranch) grossBy.set(bid, (grossBy.get(bid) ?? 0) + amount);
  for (const r of receipts) {
    const day = dayOf(r.at);
    if (day && Number.isFinite(r.amount)) day.gross += r.amount;
  }
  const gross = saleProfit + nasiyaRecognized + bank.total;

  const opex = opexFromFlows(flows, categories);
  // Xarajat sababi: filial va kun bo'yicha toifa summalari (faqat foydaga kiruvchi toifalar)
  const counted = new Set(categories.filter(categoryInProfit).map((c) => `${c.type}:${c.name}`));
  const catByBranch = new Map<string, Map<string, number>>();
  const catByDay = new Map<string, Map<string, number>>();
  const add = (m: Map<string, Map<string, number>>, key: string, cat: string, amount: number) => {
    const inner = m.get(key) ?? new Map<string, number>();
    inner.set(cat, (inner.get(cat) ?? 0) + amount);
    m.set(key, inner);
  };
  for (const f of flows) {
    const category = f.category?.trim();
    if (!category || !(f.amount > 0) || !counted.has(`${f.type}:${category}`)) continue;
    const day = dayOf(f.createdAt);
    if (day) day[f.type] += f.amount;
    if (f.type !== 'expense') continue;
    const bid = f.branchId ? String(f.branchId) : '';
    add(catByBranch, listed.has(bid) ? bid : '', category, f.amount);
    if (day) add(catByDay, day.day, category, f.amount);
  }

  const byBranch: ProfitBranchRow[] = branches.map((b) => {
    const g = grossBy.get(b.id) ?? 0;
    const o = opex.byBranch.get(b.id) ?? { income: 0, expense: 0 };
    return { id: b.id, name: b.name, gross: g, income: o.income, expense: o.expense, net: g + o.income - o.expense, top: topOf(catByBranch.get(b.id)) };
  });
  const rest = { income: opex.income - byBranch.reduce((s, r) => s + r.income, 0), expense: opex.expense - byBranch.reduce((s, r) => s + r.expense, 0) };
  if (rest.income || rest.expense || bank.rest) {
    byBranch.push({
      id: null, name: '', gross: bank.rest, income: rest.income, expense: rest.expense,
      net: bank.rest + rest.income - rest.expense, top: topOf(catByBranch.get('')),
    });
  }
  byBranch.sort((a, b) => b.net - a.net);

  const daily = [...days.values()].map((d) => ({ ...d, net: d.gross + d.income - d.expense, top: topOf(catByDay.get(d.day)) }));

  return {
    revenue, cost, bankReceived: bank.total, nasiyaDeferred, nasiyaRecognized, gross,
    otherIncome: opex.income, expense: opex.expense, net: gross + opex.income - opex.expense,
    byCategory: opex.byCategory, byBranch, daily,
  };
}
