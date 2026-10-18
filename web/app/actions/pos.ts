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
import { allocateDiscount, discountAmount, unitPriceFor } from '@/lib/posCart';
import { parseInput, zId, zMoney, zOneOf, zOptInt, zText } from '@/lib/validation';
import { getI18n } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';

type State = { error?: string; success?: string } | null;

const POS_MAX_LINES = 100;

export interface PosSaleInput {
  lines: { productId: string; qty: number; price?: number }[];
  wholesale: boolean;
  discount: { kind: 'percent' | 'amount'; value: number };
  customerName?: string;
  customerPhone?: string;
  note?: string;
}

/**
 * Kassa (POS) savatchasini sotish: har bir qator — alohida naqd sotuv.
 * Narx va chegirma serverda qayta hisoblanadi (client faqat tanlov yuboradi).
 * Chegirma katalog narxini O'ZGARTIRMAYDI — faqat sotuv summasi kamayadi.
 */
export async function posSaleAction(input: PosSaleInput): Promise<State> {
  const { user, Product, Sale, features } = await getTenantSession();
  const { d } = await getI18n();
  const m = d.sales.actions;
  const k = d.sales.pos;
  if (!features.sales) return featureDisabledError('sales');
  { const denied = await checkPermission(user, 'sale.create'); if (denied) return denied; }

  const parsed = parseInput(z.object({
    lines: z.array(z.object({
      productId: zId(m.badProductId),
      qty: zOptInt(m.badQty, 1, 1_000_000),
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
  }), input, m.noProductsSelected);
  if (!parsed.ok) return { error: parsed.error };
  const { lines, wholesale, discount, customerName, customerPhone, note } = parsed.data;

  const scope = branchFilter(user);
  const canEditPrice = await userCan(user, 'sale.editPrice');

  // 1) Avval barcha qatorlar tekshiriladi (mavjudligi, qoldig'i, narxi) — yarim sotuv bo'lmasin
  const prepared: { found: IProduct & { _id: Types.ObjectId }; qty: number; unit: number }[] = [];
  for (const line of lines) {
    const found = await Product.findOne({ _id: line.productId, ...scope }).lean<IProduct & { _id: Types.ObjectId }>();
    if (!found) return { error: m.productNotFoundOrDenied };
    if (found.status !== 'in_stock') return { error: tr(m.productNotInStock, { name: found.name }) };
    const qty = found.trackQuantity ? (line.qty ?? 1) : 1;
    const available = found.trackQuantity ? (found.quantity ?? 1) - (found.soldQuantity ?? 0) : 1;
    if (qty > available) return { error: tr(m.notEnoughStockFor, { name: found.name }) };

    let unit = unitPriceFor(found, wholesale);
    if (line.price > 0 && line.price !== unit) {
      // Narxi bor mahsulotda qo'lda narx — "sale.editPrice" huquqi kerak
      if (unit > 0 && !canEditPrice) return permissionDeniedError('sale.editPrice');
      unit = line.price;
    }
    if (!unit || unit <= 0) return { error: tr(m.enterPriceFor, { name: found.name }) };
    prepared.push({ found, qty, unit });
  }

  const lineTotals = prepared.map((p) => p.unit * p.qty);
  const subtotal = lineTotals.reduce((s, n) => s + n, 0);
  const disc = discountAmount(subtotal, discount);
  if (disc >= subtotal) return { error: k.discountTooBig };
  if (disc > 0 && !(await userCan(user, 'sale.discount'))) return permissionDeniedError('sale.discount');
  const lineDisc = allocateDiscount(lineTotals, disc);
  const customer = customerName ? { fullName: customerName, phone: customerPhone || undefined } : undefined;

  // 2) Sotish: har qator atomik zaxiralanadi; sotuv yozilmasa — mahsulot qaytadi
  let soldCount = 0;
  let soldTotal = 0;
  try {
    for (let i = 0; i < prepared.length; i++) {
      const { found, qty, unit } = prepared[i];
      const total = lineTotals[i] - lineDisc[i];
      const now = new Date();
      const product = await reserveStock(Product, found._id, qty, {
        scope,
        set: { soldPaymentType: 'cash' },
        history: { action: 'sold', detail: `${qty} ta · ${total.toLocaleString('uz-UZ')} so'm`, by: user.username, at: now },
      });
      if (!product) return { error: tr(m.notEnoughStockFor, { name: found.name }) };

      try {
        const saleNo = await generateSaleNo(Sale);
        await Sale.create({
          saleNo,
          productId: product._id,
          productSnapshot: {
            name: product.name,
            imei: product.imei,
            brand: product.brand,
            deviceModel: product.deviceModel,
            purchasePrice: product.purchasePrice,
            saleQuantity: qty,
          },
          ...(customer ? { customerSnapshot: customer } : {}),
          branchId: product.branchId,
          paymentType: 'cash',
          totalAmount: total,
          paidAmount: total,
          remainingAmount: 0,
          status: 'paid',
          payments: [{ amount: total, paidAt: now, recordedBy: user.username }],
          notes: note || undefined,
          soldBy: user.username,
        });
      } catch (err) {
        await releaseStock(Product, product._id, qty);
        throw err;
      }

      await recordAudit(user, {
        action: 'sale.pos',
        entity: 'sale',
        entityId: String(product._id),
        summary: `Kassa: ${product.name} · ${qty} ta × ${unit.toLocaleString('uz-UZ')}${lineDisc[i] ? ` − ${lineDisc[i].toLocaleString('uz-UZ')} chegirma` : ''} = ${total.toLocaleString('uz-UZ')} so'm${wholesale ? ' (ulgurji)' : ''}`,
        meta: { qty, unit, discount: lineDisc[i], total, wholesale },
      });
      soldCount += qty;
      soldTotal += total;
    }

    await markOnboardingStep(user.organizationId, 'saleMade');
    revalidatePath('/app');
    revalidatePath('/app/products');
    revalidatePath('/app/sales');
    revalidatePath('/app/shifts');
    return { success: tr(m.quickSold, { n: soldCount, sum: soldTotal.toLocaleString('uz-UZ') }) };
  } catch (err) {
    logError('posSaleAction failed', err, { user: user.username, dbName: user.dbName });
    return { error: soldCount > 0 ? tr(k.partialFail, { n: soldCount }) : m.sellFailed };
  }
}
