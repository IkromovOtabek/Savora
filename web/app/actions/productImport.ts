'use server';

import { revalidatePath } from 'next/cache';
import { Types } from 'mongoose';
import { z } from 'zod';
import { getTenantSession } from '@/lib/tenantSession';
import { isPhoneShop } from '@/lib/businessTypes';
import { checkPermission } from '@/lib/permissionGuard';
import { ensureMainBranchId } from '@/lib/mainBranch';
import { findOrCreateBrand, findOrCreateCategory } from '@/lib/catalogStore';
import { rememberBarcodeNames } from '@/lib/barcodeLookup';
import { generateProductCode, generateSku } from '@/lib/productId';
import { recordAudit } from '@/lib/audit';
import { markOnboardingStep } from '@/lib/onboarding';
import { logError } from '@/lib/logger';
import { QTY_DECIMALS } from '@/lib/qty';
import { getDict } from '@/lib/i18n/server';
import type { IProductHistory } from '@/lib/models/tenant/Product';
import {
  IMPORT_BATCH_SIZE,
  duplicateKey,
  isImeiPending,
  parseImportRow,
  type ImportContext,
  type ParsedImportRow,
  type RawImportRow,
} from '@/lib/productImport';

export type ImportSkipReason = 'duplicate' | 'dupOtherBranch' | 'dupNotCounted' | 'saveFailed' | 'invalid';
export type ImportRowResult = {
  line: number;
  status: 'created' | 'restocked' | 'skipped' | 'error';
  reason?: ImportSkipReason;
  /** Telefon do'koni: IMEI'siz qo'shildi — omborda «IMEI kiriting» bildirishnomasi chiqadi */
  noImei?: true;
};
export type ImportBatchResult = { ok: true; results: ImportRowResult[] } | { ok: false; error: string };

const cellSchema = z.union([z.string().max(2000), z.number().finite()]);
const inputSchema = z.object({
  duplicate: z.enum(['skip', 'restock']),
  rows: z.array(z.object({
    line: z.number().int().min(1).max(1_000_000),
    values: z.record(z.string().max(32), cellSchema),
    extra: z.array(z.object({ name: z.string().max(200), value: cellSchema })).max(80),
  })).min(1).max(IMPORT_BATCH_SIZE),
});

type ExistingProduct = { _id: Types.ObjectId; branchId: Types.ObjectId; trackQuantity?: boolean; kind?: string };

function dupKeyError(err: unknown): 'imei' | 'productId' | null {
  if (!err || typeof err !== 'object' || (err as { code?: number }).code !== 11000) return null;
  const kp = (err as { keyPattern?: Record<string, unknown> }).keyPattern ?? {};
  return 'productId' in kp ? 'productId' : 'imei';
}

/**
 * Excel/CSV importining bitta bo'lagi (≤ IMPORT_BATCH_SIZE qator). Client faylni o'qib, qatorlarni
 * bo'lib yuboradi; bu yerda har qator qayta tekshiriladi (client'ga ishonilmaydi).
 * Mahsulot joriy profil omboriga qo'shiladi — createProductAction bilan bir xil qoida.
 */
export async function importProductsBatchAction(input: {
  duplicate: 'skip' | 'restock';
  rows: RawImportRow[];
}): Promise<ImportBatchResult> {
  const { user, org, Product, Branch, ProductCategory, Brand } = await getTenantSession();
  { const denied = await checkPermission(user, 'product.create'); if (denied) return { ok: false, error: denied.error ?? '' }; }
  const t = (await getDict()).importer;

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t.msg.batchInvalid };
  const { duplicate, rows } = parsed.data;

  const targetBranchId = user.role === 'user' && user.branchId ? user.branchId : await ensureMainBranchId(Branch);
  const branch = await Branch.findOne({ _id: targetBranchId, active: true }, { name: 1 }).lean();
  if (!branch) return { ok: false, error: t.msg.warehouseNotFound };

  const ctx: ImportContext = { phoneShop: isPhoneShop(org), businessType: org.businessType };
  const checked = rows.map((r) => ({ line: r.line, res: parseImportRow(r as RawImportRow, ctx) }));

  // Bazadagi takrorlar — bitta so'rov bilan (imei = IMEI yoki shtrix-kod; eski tahrirlangan yozuvlar uchun barcode ham)
  const keys = [...new Set(checked.flatMap(({ res }) => (res.ok ? [duplicateKey(res.row, ctx)] : [])).filter((k): k is string => !!k))];
  const existing = new Map<string, ExistingProduct>();
  if (keys.length) {
    const found = await Product.find(
      { $or: [{ imei: { $in: keys } }, { barcode: { $in: keys } }] },
      { imei: 1, barcode: 1, branchId: 1, trackQuantity: 1, kind: 1 },
    ).lean();
    for (const p of found) {
      const e = { _id: p._id, branchId: p.branchId, trackQuantity: p.trackQuantity, kind: p.kind };
      if (p.barcode) existing.set(p.barcode.toUpperCase(), existing.get(p.barcode.toUpperCase()) ?? e);
      existing.set(p.imei.toUpperCase(), e);
    }
  }

  // Turkum va brend — nomi bo'yicha topiladi yoki yaratiladi (bo'lak ichida kesh)
  const categories = new Map<string, { categoryId: Types.ObjectId; category: string }>();
  async function categoryOf(name: string) {
    const k = name.toLowerCase();
    let c = categories.get(k);
    if (!c) {
      const id = await findOrCreateCategory(ProductCategory, name, null, user.username);
      const doc = await ProductCategory.findById(id, { name: 1 }).lean();
      c = { categoryId: id, category: doc?.name ?? name };
      categories.set(k, c);
    }
    return c;
  }
  const brands = new Map<string, string>();
  async function brandOf(name: string) {
    const k = name.toLowerCase();
    let b = brands.get(k);
    if (!b) {
      b = (await findOrCreateBrand(Brand, name, user.username)).name;
      brands.set(k, b);
    }
    return b;
  }

  const now = new Date();
  const results: ImportRowResult[] = [];
  const remembered: { code: string; name: string }[] = [];

  async function restock(p: ExistingProduct, row: ParsedImportRow): Promise<ImportRowResult['status']> {
    const set: Record<string, unknown> = {};
    if (row.purchasePrice > 0) set.purchasePrice = row.purchasePrice;
    if (row.salePrice > 0) set.salePrice = row.salePrice;
    if (row.wholesalePrice) set.wholesalePrice = row.wholesalePrice;
    const qty = row.quantity ?? 0;
    const history: IProductHistory = { action: 'restocked', detail: `Excel: +${qty}`, by: user.username, at: now };
    // Pipeline + $round — kasrli miqdorda float qoldig'i to'planmaydi (lib/stock.ts bilan bir xil)
    await Product.updateOne({ _id: p._id, trackQuantity: true }, [
      {
        $set: {
          quantity: { $round: [{ $add: ['$quantity', qty] }, QTY_DECIMALS] },
          status: { $cond: [{ $and: [{ $eq: ['$status', 'sold'] }, { $gt: [qty, 0] }] }, 'in_stock', '$status'] },
          ...Object.fromEntries(Object.entries(set).map(([k, v]) => [k, { $literal: v }])),
          history: { $concatArrays: [{ $ifNull: ['$history', []] }, [{ $literal: history }]] },
        },
      },
    ]);
    return 'restocked';
  }

  for (const { line, res } of checked) {
    if (!res.ok) { results.push({ line, status: 'error', reason: 'invalid' }); continue; }
    const row = res.row;
    const key = duplicateKey(row, ctx);
    const dup = key ? existing.get(key) : undefined;

    if (dup) {
      if (duplicate === 'skip') { results.push({ line, status: 'skipped', reason: 'duplicate' }); continue; }
      if (String(dup.branchId) !== String(targetBranchId)) { results.push({ line, status: 'skipped', reason: 'dupOtherBranch' }); continue; }
      if (!dup.trackQuantity || dup.kind === 'service' || dup.kind === 'bundle') {
        results.push({ line, status: 'skipped', reason: 'dupNotCounted' });
        continue;
      }
      try {
        results.push({ line, status: await restock(dup, row) });
      } catch (err) {
        logError('import restock failed', err, { user: user.username, dbName: user.dbName });
        results.push({ line, status: 'error', reason: 'saveFailed' });
      }
      continue;
    }

    try {
      // IMEI'siz telefon — `imei` (unikal) maydonida vaqtinchalik SKU, IMEI tahrirda kiritiladi
      const noImei = isImeiPending(row, ctx);
      const doc = {
        kind: 'goods' as const,
        name: row.name,
        imei: ctx.phoneShop && row.imei ? row.imei : !ctx.phoneShop && row.barcode ? row.barcode.toUpperCase() : generateSku(),
        imeiPending: noImei || undefined,
        barcode: row.barcode,
        purchasePrice: row.purchasePrice,
        salePrice: row.salePrice,
        wholesalePrice: row.wholesalePrice || undefined,
        trackQuantity: row.quantity !== undefined,
        quantity: row.quantity ?? 1,
        soldQuantity: 0,
        status: 'in_stock' as const,
        branchId: new Types.ObjectId(String(targetBranchId)),
        ...(row.category ? await categoryOf(row.category) : {}),
        brand: row.brand ? await brandOf(row.brand) : undefined,
        unit: row.unit,
        color: row.color,
        size: row.size,
        warrantyMonths: row.warrantyMonths,
        batchNumber: row.batchNumber,
        expiryDate: row.expiryDate ? new Date(`${row.expiryDate}T00:00:00Z`) : undefined,
        oemCode: row.oemCode,
        notes: row.notes,
        extraFields: row.extra.length ? row.extra : undefined,
        createdBy: user.username,
        history: [{ action: 'created' as const, detail: `${branch.name} · Excel`, by: user.username, at: now }],
      };
      let created: { _id: Types.ObjectId } | null = null;
      // productId tasodifiy — kamdan-kam to'qnashuvda qayta urinamiz
      for (let attempt = 0; attempt < 3 && !created; attempt++) {
        try {
          created = await Product.create({ ...doc, productId: generateProductCode() });
        } catch (err) {
          if (dupKeyError(err) !== 'productId') throw err;
        }
      }
      if (!created) throw new Error('productId collision');
      results.push(noImei ? { line, status: 'created', noImei: true } : { line, status: 'created' });
      // Fayl ichidagi keyingi takror qator — shu mahsulotga (rejimga qarab o'tkaziladi yoki qoldiqqa qo'shiladi)
      if (key) existing.set(key, { _id: created._id, branchId: doc.branchId, trackQuantity: doc.trackQuantity, kind: 'goods' });
      if (row.barcode) remembered.push({ code: row.barcode, name: row.name });
    } catch (err) {
      if (dupKeyError(err) === 'imei') {
        results.push({ line, status: 'skipped', reason: 'duplicate' });
      } else {
        logError('import create failed', err, { user: user.username, dbName: user.dbName });
        results.push({ line, status: 'error', reason: 'saveFailed' });
      }
    }
  }

  const count = (s: ImportRowResult['status']) => results.filter((r) => r.status === s).length;
  const createdN = count('created');
  const restockedN = count('restocked');
  if (createdN || restockedN) {
    await recordAudit(user, {
      action: 'product.import',
      entity: 'product',
      summary: `Excel import: ${createdN} ta yangi, ${restockedN} ta to'ldirildi (${branch.name})`,
      meta: { created: createdN, restocked: restockedN, skipped: count('skipped'), errors: count('error'), lines: [rows[0].line, rows[rows.length - 1].line] },
    });
    if (createdN) await markOnboardingStep(user.organizationId, 'productAdded');
    if (remembered.length) await rememberBarcodeNames(user.organizationId, remembered);
    revalidatePath('/app');
    revalidatePath('/app/products');
  }
  return { ok: true, results };
}
