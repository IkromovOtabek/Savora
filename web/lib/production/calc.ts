/**
 * Ishlab chiqarish va kirim — SOF hisob-kitob (DB importi yo'q: client, server, testlar bir xil ishlatadi).
 * To'liq hujjat: docs/SEX_API.md.
 *
 *  - Birlik konvertatsiyasi: xarid birligi (qop) → asosiy birlik (kg) `purchaseFactor` bilan.
 *  - Ehtiyoj: texkarta `outputQty` birlik uchun sarf × (reja / outputQty) × (1 + yo'qotish%); butun birlikda
 *    yuqoriga butunlanadi, kasrlida — 0,001 gacha yuqoriga.
 *  - O'rtacha tortilgan tannarx: (qoldiq × eski narx + kirim × kirim narxi) / (qoldiq + kirim), butun so'm.
 *  - Ishlab chiqarish tannarxi: materiallar + ish haqi + ustama; birlik = jami / (yaroqli + brak).
 *  - Holat o'tishlari (akt, kirim, xarid, ishbay) va ishbay jamlamasi.
 */
import { isFractionalUnit, isValidQty, priceTimesQty, roundQty } from '../qty';

/* ───────────────────────────── chegaralar ───────────────────────────── */

export const PRODUCTION_LIMITS = {
  /** Texkartadagi xom ashyo va operatsiya qatorlari */
  maxRecipeItems: 60,
  maxRecipeOperations: 30,
  /** Akt/kirim/xarid qatorlari */
  maxLines: 200,
  maxLossPct: 90,
  /** Saqlanadigan eski versiyalar */
  maxRecipeVersions: 20,
  /** Ishbay: bitta tasdiqlash/to'lov so'rovidagi yozuvlar */
  maxBatchIds: 500,
  /** Ro'yxatlar sahifasi */
  pageSize: 50,
  maxPageSize: 200,
  /** Davr hisobotlari (kun) */
  maxPeriodDays: 366,
  /** «Bajarildi»/«post» qulfi shu muddatdan eski bo'lsa — qulflangan jarayon uzilgan deb hisoblanadi */
  staleLockMs: 10 * 60 * 1000,
  noteMax: 500,
  /** Akt: mijoz buyurtmasi matni */
  customerRefMax: 160,
} as const;

/**
 * Akt muddati o'tganmi: ochiq (qoralama/jarayonda) va muddat kuni (UTC yarim tunda saqlangan kalendar kuni)
 * bugungi Toshkent kunidan oldin. `todayKey` — `tashkentDayKey(new Date())`.
 */
export function isOrderOverdue(status: string, dueDate: Date | string | null | undefined, todayKey: string): boolean {
  if (!dueDate || (status !== 'draft' && status !== 'in_progress')) return false;
  return new Date(dueDate).toISOString().slice(0, 10) < todayKey;
}

/* ───────────────────────────── birlik konvertatsiyasi ───────────────────────────── */

export interface UnitSource {
  unit?: string | null;
  purchaseUnit?: string | null;
  purchaseFactor?: number | null;
}

/**
 * Kiritilgan birlik → asosiy birlikka koeffitsient. Asosiy birlik (yoki birlik berilmagan) — 1;
 * mahsulotning xarid birligi — `purchaseFactor`; boshqasi — null (noto'g'ri birlik).
 */
export function unitFactor(p: UnitSource, unit?: string | null): number | null {
  const base = p.unit || 'dona';
  if (!unit || unit === base) return 1;
  if (p.purchaseUnit && unit === p.purchaseUnit && p.purchaseFactor && p.purchaseFactor > 0) return p.purchaseFactor;
  return null;
}

/** Xarid koeffitsienti yaroqlimi: musbat, ≤ 1 000 000, ko'pi bilan 3 xona */
export function isValidFactor(f: unknown): f is number {
  return typeof f === 'number' && Number.isFinite(f) && f > 0 && f <= 1_000_000 && Math.abs(roundQty(f) - f) < 1e-9;
}

/** Kiritilgan miqdor → asosiy birlikda (3 xona) */
export function toBaseQty(qty: number, factor: number): number {
  return roundQty(qty * factor);
}

export type LineQty =
  | { ok: true; factor: number; baseQty: number }
  | { ok: false; reason: 'badUnit' | 'badQty' };

/**
 * Hujjat qatori miqdori: birlik mahsulotga mos (asosiy yoki xarid), miqdor shu birlikka yaroqli
 * (dona — butun, kg — ≤3 xona), asosiy birlikdagi natija ham asosiy birlikka yaroqli.
 */
export function lineQty(p: UnitSource, qty: number, unit?: string | null): LineQty {
  const factor = unitFactor(p, unit);
  if (factor === null) return { ok: false, reason: 'badUnit' };
  const entered = unit || p.unit || 'dona';
  if (!isValidQty(qty, entered)) return { ok: false, reason: 'badQty' };
  const baseQty = toBaseQty(qty, factor);
  if (!isValidQty(baseQty, p.unit || 'dona')) return { ok: false, reason: 'badQty' };
  return { ok: true, factor, baseQty };
}

/** Qator summasi: narx × miqdor, butun so'm (narx — kiritilgan birlik uchun) */
export function lineAmount(price: number, qty: number): number {
  return priceTimesQty(price, qty);
}

/** Asosiy birlikdagi tannarx (kasr bo'lishi mumkin): summa / asosiy miqdor */
export function baseUnitCost(amount: number, baseQty: number): number {
  return baseQty > 0 ? amount / baseQty : 0;
}

/* ───────────────────────────── o'rtacha tortilgan tannarx ───────────────────────────── */

/**
 * O'rtacha tortilgan tannarx (kirim va ishlab chiqarish uchun umumiy). Butun so'mga yaxlitlanadi.
 *  - qoldiq yo'q (≤ 0) yoki eski narx 0 (narxi kiritilmagan tovar) — yangi narx;
 *  - kirim miqdori 0 — eski narx o'zgarmaydi.
 */
export function weightedAverageCost(stockQty: number, stockCost: number, inQty: number, inCost: number): number {
  const q = Math.max(0, stockQty);
  const c = Math.max(0, stockCost || 0);
  const iq = Math.max(0, inQty);
  const ic = Math.max(0, inCost || 0);
  if (!(iq > 0)) return Math.round(c);
  if (!(q > 0) || !(c > 0)) return Math.round(ic);
  return Math.round((q * c + iq * ic) / (q + iq));
}

/* ───────────────────────────── ehtiyoj (texkarta → reja) ───────────────────────────── */

/** Miqdorni birlik qoidasi bo'yicha YUQORIGA yaxlitlash: butun birlik — butun, kasrli — 0,001 */
export function ceilQty(n: number, unit?: string | null): number {
  if (!(n > 0)) return 0;
  if (!isFractionalUnit(unit)) return Math.ceil(n - 1e-9);
  return Math.ceil(n * 1000 - 1e-6) / 1000;
}

/**
 * Bitta xom ashyo ehtiyoji: (texkarta sarfi / chiqish miqdori) × reja × (1 + yo'qotish%).
 * Masalan: 10 non uchun 4 kg un, yo'qotish 5% → 25 non: 4 × 2,5 × 1,05 = 10,5 kg.
 */
export function requiredQty(itemQty: number, lossPct: number, plannedQty: number, outputQty: number, unit?: string | null): number {
  if (!(outputQty > 0) || !(plannedQty > 0) || !(itemQty > 0)) return 0;
  const loss = Math.min(Math.max(lossPct || 0, 0), PRODUCTION_LIMITS.maxLossPct);
  const raw = (itemQty * plannedQty / outputQty) * (1 + loss / 100);
  return ceilQty(raw, unit);
}

export interface RecipeItemLike {
  code: string;
  name: string;
  qty: number;
  unit?: string | null;
  lossPct?: number | null;
}

export interface PlannedMaterial {
  code: string;
  name: string;
  unit?: string | null;
  /** Yo'qotishsiz sof sarf (ma'lumot uchun) */
  netQty: number;
  plannedQty: number;
}

/** Texkarta → N birlik uchun xom ashyo rejasi */
export function planMaterials(items: readonly RecipeItemLike[], plannedQty: number, outputQty: number): PlannedMaterial[] {
  return items.map((it) => ({
    code: it.code,
    name: it.name,
    unit: it.unit ?? null,
    netQty: roundQty(outputQty > 0 ? (it.qty * plannedQty) / outputQty : 0),
    plannedQty: requiredQty(it.qty, it.lossPct ?? 0, plannedQty, outputQty, it.unit),
  }));
}

export interface OperationLike {
  name: string;
  rate: number;
}

/**
 * Ish haqi rejasi: texkarta operatsiyalari × miqdor. `rate` — 1 birlik tayyor mahsulot uchun
 * (texkartada `outputQty` birlikka emas — operatsiya narxi doim donaga/kg ga).
 */
export function planLabor(ops: readonly OperationLike[], qty: number): { operation: string; qty: number; rate: number; amount: number }[] {
  return ops.map((o) => ({ operation: o.name, qty: roundQty(qty), rate: o.rate, amount: lineAmount(o.rate, qty) }));
}

/* ───────────────────────────── ishlab chiqarish tannarxi ───────────────────────────── */

export interface CostInput {
  materials: readonly { qty: number; unitCost: number }[];
  labor: readonly { amount: number }[];
  overheadPerUnit: number;
  producedQty: number;
  scrapQty: number;
}

export interface CostResult {
  materialsCost: number;
  laborCost: number;
  overheadCost: number;
  costTotal: number;
  /** jami / (yaroqli + brak), butun so'm */
  unitCost: number;
  /** Brak qiymati = jami − yaroqli × birlik (≥ 0) */
  scrapCost: number;
}

/**
 * Tannarx = materiallar (o'rtacha kelish narxi × haqiqiy sarf) + ish haqi + ustama (1 birlikka × yaroqli).
 * Birlik tannarxi brak bilan birga bo'linadi: brak qiymati zarar (StockAdjustment) sifatida alohida
 * ko'rinadi, yaroqli mahsulot tannarxiga ikki marta kirmaydi.
 */
export function computeProductionCost(input: CostInput): CostResult {
  const materialsCost = input.materials.reduce((s, m) => s + priceTimesQty(Math.max(0, m.unitCost), Math.max(0, m.qty)), 0);
  const laborCost = input.labor.reduce((s, l) => s + Math.max(0, Math.round(l.amount)), 0);
  const overheadCost = lineAmount(Math.max(0, input.overheadPerUnit), Math.max(0, input.producedQty));
  const costTotal = materialsCost + laborCost + overheadCost;
  const units = roundQty(Math.max(0, input.producedQty) + Math.max(0, input.scrapQty));
  const unitCost = units > 0 ? Math.round(costTotal / units) : 0;
  const scrapCost = input.scrapQty > 0 ? Math.max(0, costTotal - priceTimesQty(unitCost, input.producedQty)) : 0;
  return { materialsCost, laborCost, overheadCost, costTotal, unitCost, scrapCost };
}

/**
 * 1 birlik tayyor mahsulotning taxminiy tannarxi (texkarta kartochkasi uchun): xom ashyo (yo'qotish bilan,
 * yaxlitlashsiz) × joriy o'rtacha narx + operatsiyalar + ustama.
 */
export function estimateUnitCost(
  items: readonly RecipeItemLike[],
  outputQty: number,
  costByCode: ReadonlyMap<string, number>,
  ops: readonly OperationLike[],
  overheadPerUnit: number,
): { materials: number; labor: number; overhead: number; total: number; missing: string[] } {
  let materials = 0;
  const missing: string[] = [];
  for (const it of items) {
    const c = costByCode.get(it.code);
    if (c === undefined) missing.push(it.code);
    const perUnit = outputQty > 0 ? (it.qty / outputQty) * (1 + Math.min(Math.max(it.lossPct ?? 0, 0), PRODUCTION_LIMITS.maxLossPct) / 100) : 0;
    materials += perUnit * (c ?? 0);
  }
  const labor = ops.reduce((s, o) => s + Math.max(0, o.rate), 0);
  const m = Math.round(materials);
  const oh = Math.round(Math.max(0, overheadPerUnit));
  return { materials: m, labor, overhead: oh, total: m + labor + oh, missing };
}

/* ───────────────────────────── holat o'tishlari ───────────────────────────── */

export type ProductionStatus = 'draft' | 'in_progress' | 'done' | 'cancelled';
export type ProductionOp = 'edit' | 'start' | 'complete' | 'cancel';

/** Akt holati → ruxsat etilgan amallar */
export function productionAllows(status: ProductionStatus, op: ProductionOp): boolean {
  switch (op) {
    case 'edit':
    case 'complete':
    case 'cancel':
      return status === 'draft' || status === 'in_progress';
    case 'start':
      return status === 'draft';
  }
}

export type ReceiptStatus = 'draft' | 'posted' | 'cancelled';
export function receiptAllows(status: ReceiptStatus, op: 'edit' | 'post' | 'cancel'): boolean {
  return status === 'draft' && (op === 'edit' || op === 'post' || op === 'cancel');
}

export type PoStatus = 'draft' | 'sent' | 'partial' | 'received' | 'cancelled';
export type PoOp = 'edit' | 'send' | 'receive' | 'cancel';
export function poAllows(status: PoStatus, op: PoOp): boolean {
  switch (op) {
    case 'edit':
      return status === 'draft' || status === 'sent';
    case 'send':
      return status === 'draft';
    case 'receive':
      return status === 'draft' || status === 'sent' || status === 'partial';
    case 'cancel':
      return status === 'draft' || status === 'sent' || status === 'partial';
  }
}

/** Qabuldan keyingi xarid holati: hammasi qabul — received, bir qismi — partial, hech biri — oldingisi */
export function poStatusAfterReceipt(lines: readonly { qty: number; receivedQty: number }[], current: PoStatus): PoStatus {
  if (current === 'cancelled') return current;
  const any = lines.some((l) => l.receivedQty > 0);
  if (!any) return current;
  const all = lines.every((l) => roundQty(l.receivedQty - l.qty) >= 0);
  return all ? 'received' : 'partial';
}

/** Xarid qatoridagi qabul qilinmagan miqdor (shu qator birligida) */
export function poRemaining(line: { qty: number; receivedQty: number }): number {
  return Math.max(0, roundQty(line.qty - line.receivedQty));
}

export type PieceworkStatus = 'logged' | 'approved' | 'rejected' | 'paid';
export function pieceworkAllows(status: PieceworkStatus, op: 'edit' | 'approve' | 'reject' | 'pay'): boolean {
  switch (op) {
    case 'edit':
    case 'approve':
    case 'reject':
      return status === 'logged';
    case 'pay':
      return status === 'approved';
  }
}

/* ───────────────────────────── ishbay jamlamasi ───────────────────────────── */

export interface PieceworkLike {
  workerId: string;
  workerName: string;
  operation: string;
  qty: number;
  amount: number;
  status: PieceworkStatus;
}

export interface Bucket {
  count: number;
  qty: number;
  amount: number;
}

export interface WorkerSummary {
  workerId: string;
  workerName: string;
  logged: Bucket;
  approved: Bucket;
  paid: Bucket;
  rejected: Bucket;
  /** To'lanishi kerak (tasdiqlangan, hali to'lanmagan) */
  due: number;
  byOperation: { operation: string; qty: number; amount: number }[];
}

const empty = (): Bucket => ({ count: 0, qty: 0, amount: 0 });

/** Xodim bo'yicha davr jamlamasi (rad etilganlar operatsiya kesimiga kirmaydi) */
export function summarizePiecework(entries: readonly PieceworkLike[]): { workers: WorkerSummary[]; totals: { logged: Bucket; approved: Bucket; paid: Bucket; due: number } } {
  const map = new Map<string, WorkerSummary & { ops: Map<string, { qty: number; amount: number }> }>();
  for (const e of entries) {
    let w = map.get(e.workerId);
    if (!w) {
      w = { workerId: e.workerId, workerName: e.workerName, logged: empty(), approved: empty(), paid: empty(), rejected: empty(), due: 0, byOperation: [], ops: new Map() };
      map.set(e.workerId, w);
    }
    const b = w[e.status];
    b.count += 1;
    b.qty = roundQty(b.qty + e.qty);
    b.amount += e.amount;
    if (e.status !== 'rejected') {
      const o = w.ops.get(e.operation) ?? { qty: 0, amount: 0 };
      o.qty = roundQty(o.qty + e.qty);
      o.amount += e.amount;
      w.ops.set(e.operation, o);
    }
  }
  const workers = [...map.values()].map(({ ops, ...w }) => ({
    ...w,
    due: w.approved.amount,
    byOperation: [...ops.entries()].map(([operation, v]) => ({ operation, ...v })).sort((a, b) => b.amount - a.amount),
  })).sort((a, b) => (b.approved.amount + b.logged.amount + b.paid.amount) - (a.approved.amount + a.logged.amount + a.paid.amount));
  const totals = { logged: empty(), approved: empty(), paid: empty(), due: 0 };
  for (const w of workers) {
    for (const k of ['logged', 'approved', 'paid'] as const) {
      totals[k].count += w[k].count;
      totals[k].qty = roundQty(totals[k].qty + w[k].qty);
      totals[k].amount += w[k].amount;
    }
  }
  totals.due = totals.approved.amount;
  return { workers, totals };
}

/* ───────────────────────────── minimal qoldiq ───────────────────────────── */

/** Qoldiq minimal chegaradan kammi (chegara berilmagan — yo'q) */
export function isBelowMin(available: number, minStock?: number | null): boolean {
  return typeof minStock === 'number' && minStock > 0 && roundQty(available) < minStock;
}
