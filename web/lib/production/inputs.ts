/**
 * Ishlab chiqarish va kirim kirish sxemalari (zod) — server action, web API va mobil API bir xil tekshiradi.
 * Ishonchsiz kirish: ObjectId'lar 24 hex, matnlar uzunligi cheklangan, raqamlar oraliqda — NoSQL injection
 * (obyekt/operator) o'tmaydi. Xato xabari — d.production.errors.
 */
import { z } from 'zod';
import type { Dict } from '../i18n/dict';
import { PRODUCT_UNITS } from '../businessTypes';
import { zField, zId, zOneOf, zOptDate, zOptId, zQty, zText } from '../validation';
import { PRODUCTION_LIMITS as L } from './calc';

type Errors = Dict['production']['errors'];

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));

/** Klient kaliti (idempotentlik): [A-Za-z0-9:_-], 8–64 belgi; bo'sh — undefined */
export const zOptClientId = (message: string) =>
  zField((v, ctx) => {
    const s = str(v).trim();
    if (!s) return undefined;
    if (s.length < 8 || s.length > 64 || !/^[A-Za-z0-9:_-]+$/.test(s)) {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    return s;
  });

const parseNum = (v: unknown, min: number, max: number, int?: boolean): number | null => {
  const n = typeof v === 'number' ? v : Number(str(v).replace(/\s/g, '').replace(',', '.'));
  return !Number.isFinite(n) || n < min || n > max || (int && !Number.isInteger(n)) ? null : n;
};

/** Ixtiyoriy son oralig'ida; yuborilmasa (yoki null/'') — undefined */
export const zOptNum = (message: string, min: number, max: number, opts: { int?: boolean } = {}) =>
  zField((v, ctx): number | undefined => {
    if (v === undefined || v === null || str(v).trim() === '') return undefined;
    const n = parseNum(v, min, max, opts.int);
    if (n === null) {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    return n;
  });

/** Ixtiyoriy son, `null`/'' — null (tozalash), yuborilmasa — undefined (o'zgarmaydi) */
export const zOptNumOrNull = (message: string, min: number, max: number) =>
  zField((v, ctx): number | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null || str(v).trim() === '') return null;
    const n = parseNum(v, min, max);
    if (n === null) {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    return n;
  });

/** So'm (butun, ≥ 0); yuborilmasa — undefined, null/'' — null (narx hali kiritilmagan) */
export const zOptPrice = (message: string) =>
  zField((v, ctx) => {
    if (v === undefined) return undefined;
    if (v === null || str(v).trim() === '') return null;
    const n = typeof v === 'number' ? v : Number(str(v).replace(/\s/g, ''));
    if (!Number.isSafeInteger(n) || n < 0) {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    return n;
  });

/** Ixtiyoriy matn: yuborilmasa — undefined, null — '' (tozalash) */
export const zOptText = (max: number, message: string) =>
  zField((v, ctx) => {
    if (v === undefined) return undefined;
    if (v === null) return '';
    if (typeof v !== 'string' && typeof v !== 'number') {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    const s = String(v).trim();
    if (s.length > max) {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    return s;
  });

export const zOptBool = () =>
  zField((v) => {
    if (v === undefined || v === null || v === '') return undefined;
    return v === true || v === 'true' || v === '1' || v === 'on';
  });

/** Ixtiyoriy birlik (PRODUCT_UNITS); bo'sh — undefined, null — null (tozalash) */
const zOptUnit = (message: string) =>
  zField((v, ctx) => {
    if (v === undefined || v === '') return undefined;
    if (v === null) return null;
    if (!(PRODUCT_UNITS as readonly string[]).includes(str(v))) {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    return str(v) as (typeof PRODUCT_UNITS)[number];
  });

/** Kasrli son (≥ 0, ≤3 xona), 0 ham mumkin (haqiqiy sarf 0 — ishlatilmadi) */
const zNonNegQty = (message: string) =>
  zField((v, ctx) => {
    const n = typeof v === 'number' ? v : Number(str(v).replace(/\s/g, '').replace(',', '.'));
    if (str(v).trim() === '' || !Number.isFinite(n) || n < 0 || n > 1_000_000 || Math.abs(Math.round(n * 1000) - n * 1000) > 1e-6) {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    return Math.round(n * 1000) / 1000;
  });

const zMoneyReq = (message: string) =>
  zField((v, ctx) => {
    const n = typeof v === 'number' ? v : Number(str(v).replace(/\s/g, ''));
    if (str(v).trim() === '' || !Number.isSafeInteger(n) || n < 0) {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    return n;
  });

export function productionSchemas(e: Errors) {
  const bad = e.badInput;
  const tooMany = e.tooManyLines;
  const qty = (msg = bad) => zQty(msg);

  const recipeItem = z.object({
    productId: zId(e.productNotFound),
    qty: qty(),
    unit: zOptUnit(bad),
    lossPct: zOptNum(bad, 0, L.maxLossPct),
  });
  const recipeOp = z.object({
    name: zText(80, bad).refine((s) => s.length > 0, bad),
    rate: zOptNum(bad, 0, 1_000_000_000, { int: true }),
    normMin: zOptNum(bad, 0, 100_000),
  });
  const materialEdit = z.object({
    /** Mavjud qator id'si; yo'q — yangi (qo'shimcha) qator: productId majburiy */
    id: zOptId(bad),
    productId: zOptId(e.productNotFound),
    actualQty: zNonNegQty(bad),
  });
  const laborEdit = z.object({
    operation: zText(80, bad).refine((s) => s.length > 0, bad),
    workerId: zOptId(e.workerNotFound),
    qty: zNonNegQty(bad),
    rate: zMoneyReq(bad),
  });
  const docLine = z.object({
    productId: zId(e.productNotFound),
    qty: qty(),
    unit: zOptUnit(bad),
    price: zOptPrice(e.badPrice),
  });

  return {
    id: z.object({ id: zId(bad) }),

    /* ── texkarta ── */
    recipe: z.object({
      id: zOptId(e.recipeNotFound),
      name: zText(120, bad).refine((s) => s.length > 0, bad),
      mode: zOneOf(['production', 'onSale'] as const, bad).optional(),
      outputProductId: zId(e.outputNotFound),
      outputQty: qty(),
      items: z.array(recipeItem).min(1, e.emptyLines).max(L.maxRecipeItems, tooMany),
      operations: z.array(recipeOp).max(L.maxRecipeOperations, tooMany).optional(),
      overheadPerUnit: zOptNum(bad, 0, 1_000_000_000, { int: true }),
      note: zOptText(L.noteMax, bad),
      /** Optimistik tekshiruv: tahrirlanayotgan versiya (boshqa birov o'zgartirgan bo'lsa — conflict) */
      expectedVersion: zOptNum(bad, 1, 1_000_000, { int: true }),
    }),
    recipeActive: z.object({ id: zId(e.recipeNotFound), active: zOptBool().transform((b) => !!b) }),
    requirements: z.object({
      recipeId: zId(e.recipeNotFound),
      qty: qty(),
      branchId: zOptId(e.badBranch),
    }),

    /* ── ishlab chiqarish akti ── */
    orderCreate: z.object({
      recipeId: zId(e.recipeNotFound),
      plannedQty: qty(),
      fromBranchId: zOptId(e.badBranch),
      toBranchId: zOptId(e.badBranch),
      note: zText(L.noteMax, bad),
      clientId: zOptClientId(bad),
    }),
    orderUpdate: z.object({
      plannedQty: zOptNum(bad, 0.001, 1_000_000),
      note: zOptText(L.noteMax, bad),
      materials: z.array(materialEdit).max(L.maxLines, tooMany).optional(),
      labor: z.array(laborEdit).max(L.maxLines, tooMany).optional(),
    }),
    orderComplete: z.object({
      producedQty: zNonNegQty(e.producedRequired),
      scrapQty: zOptNum(bad, 0, 1_000_000),
      materials: z.array(materialEdit).max(L.maxLines, tooMany).optional(),
      labor: z.array(laborEdit).max(L.maxLines, tooMany).optional(),
    }),
    orderCancel: z.object({ reason: zText(300, bad) }),

    /* ── kirim akti ── */
    receipt: z.object({
      supplierId: zOptId(e.supplierNotFound),
      branchId: zOptId(e.badBranch),
      purchaseOrderId: zOptId(e.poNotFound),
      supplierInvoiceNo: zText(60, bad),
      invoiceDate: zOptDate(bad),
      note: zText(L.noteMax, bad),
      paidNow: zOptNum(bad, 0, 1e13, { int: true }),
      lines: z.array(docLine.extend({ expiryDate: zOptDate(bad), poLineId: zOptId(bad) })).min(1, e.emptyLines).max(L.maxLines, tooMany),
      clientId: zOptClientId(bad),
    }),
    receiptPost: z.object({ paidNow: zOptNum(bad, 0, 1e13, { int: true }) }),

    /* ── yetkazib beruvchiga buyurtma ── */
    po: z.object({
      supplierId: zId(e.supplierNotFound),
      branchId: zOptId(e.badBranch),
      expectedAt: zOptDate(bad),
      note: zText(L.noteMax, bad),
      lines: z.array(docLine).min(1, e.emptyLines).max(L.maxLines, tooMany),
      clientId: zOptClientId(bad),
    }),

    /* ── ishbay ── */
    pieceworkLog: z.object({
      /** Faqat `piecework.approve` bilan boshqa ishchi uchun; aks holda — o'zi */
      workerId: zOptId(e.workerNotFound),
      productionOrderId: zOptId(e.orderNotFound),
      operation: zText(80, bad).refine((s) => s.length > 0, bad),
      qty: qty(),
      /** Aktdagi texkarta operatsiyasi topilsa — e'tiborsiz (narx serverda) */
      rate: zOptNum(bad, 0, 1_000_000_000, { int: true }),
      workDate: zOptDate(bad),
      note: zText(300, bad),
      clientId: zOptClientId(bad),
    }),
    pieceworkEdit: z.object({
      id: zId(e.entryNotFound),
      qty: zOptNum(bad, 0.001, 1_000_000),
      rate: zOptNum(bad, 0, 1_000_000_000, { int: true }),
      operation: zOptText(80, bad),
    }),
    pieceworkIds: z.object({
      ids: z.array(zId(e.entryNotFound)).min(1, bad).max(L.maxBatchIds, tooMany),
      reason: zText(300, bad),
    }),
    pieceworkPay: z.object({
      workerId: zId(e.workerNotFound),
      /** Berilmasa — ishchining barcha tasdiqlangan (davr ichidagi) yozuvlari */
      ids: z.array(zId(e.entryNotFound)).max(L.maxBatchIds, tooMany).optional(),
      from: zOptDate(bad),
      to: zOptDate(bad),
      /** Kassa chiqimi qaysi filialga yoziladi (ixtiyoriy) */
      branchId: zOptId(e.badBranch),
      clientId: zOptClientId(bad),
    }),

    /* ── mahsulotning ombor sozlamalari ── */
    stockSettings: z.object({
      productId: zId(e.productNotFound),
      minStock: zOptNumOrNull(bad, 0, 1_000_000),
      purchaseUnit: zOptUnit(e.badUnit.replace('{name}', '—')),
      purchaseFactor: zOptNumOrNull(e.badFactor, 0.001, 1_000_000),
    }),

    /** Ro'yxat so'rovi (GET ?status=&branchId=&from=&to=&q=&page=&limit=…) */
    list: z.object({
      status: zText(20, bad),
      branchId: zOptId(e.badBranch),
      supplierId: zOptId(e.supplierNotFound),
      recipeId: zOptId(e.recipeNotFound),
      workerId: zOptId(e.workerNotFound),
      productionOrderId: zOptId(e.orderNotFound),
      purchaseOrderId: zOptId(e.poNotFound),
      from: zOptDate(bad),
      to: zOptDate(bad),
      q: zText(80, bad),
      active: zField((v) => (v === 'all' ? 'all' : v === '0' || v === 'false' ? false : v === '1' || v === 'true' ? true : undefined)),
      page: zOptNum(bad, 1, 10_000, { int: true }),
      limit: zOptNum(bad, 1, L.maxPageSize, { int: true }),
      mine: zOptBool(),
    }),
  };
}

export type ProductionSchemas = ReturnType<typeof productionSchemas>;

/** URLSearchParams → oddiy obyekt (faqat birinchi qiymat) */
export function searchParamsObject(sp: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of sp.entries()) if (!(k in out)) out[k] = v;
  return out;
}
