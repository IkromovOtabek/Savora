/**
 * Sotuvni bekor qilish va qisman qaytarish — YAGONA yo'l (web sotuv sahifasi va mobil ilova).
 * Huquq (sale.cancel / sale.return) chaqiruvchida; xatolar kod bilan, matn — `saleUndoErrorText`.
 */
import type { Model } from 'mongoose';
import type { ISale } from '../models/tenant/Sale';
import type { IProduct } from '../models/tenant/Product';
import type { ICashFlow } from '../models/tenant/CashFlow';
import type { ICashShift } from '../models/tenant/CashShift';
import type { IFinanceCategory } from '../models/tenant/FinanceCategory';
import type { SessionUser } from '../session';
import type { Dict } from '../i18n/dict';
import { SALE_CANCEL_CATEGORY } from '../models/tenant/FinanceCategory';
import { branchFilter } from '../branchScope';
import { releaseStock } from '../stock';
import { recordAudit } from '../audit';
import { logError } from '../logger';
import { computePartialReturn } from '../saleReturn';
import { qtyLabel } from '../qty';

export type SaleUndoError = 'saleNotFound' | 'alreadyCancelled' | 'returnBankCredit' | 'returnBadQty' | 'returnUseCancel' | 'returnConflict';

type Models = {
  Sale: Model<ISale>;
  Product: Model<IProduct>;
  CashFlow: Model<ICashFlow>;
  CashShift: Model<ICashShift>;
  FinanceCategory: Model<IFinanceCategory>;
};

/**
 * Bekor qilish: tovar omborga qaytadi, to'langan pul mijozga naqd qaytariladi (Moliya'da
 * «Sotuv bekor qilindi» chiqimi — kassa va smenadan ayiriladi). Idempotent.
 */
export async function cancelSale(
  m: Models,
  user: SessionUser,
  saleId: string,
): Promise<{ ok: true; saleNo: string; refund: number } | { ok: false; error: SaleUndoError }> {
  const { Product, Sale, CashFlow, CashShift, FinanceCategory } = m;
  // Idempotent: faqat bekor qilinmagan sotuv bir marta "cancelled" ga o'tadi —
  // ikki marta bosilsa ham mahsulot omborga ikki marta qaytmaydi, pul ikki marta chiqmaydi.
  // cancelledAt — yangi tartib belgisi: to'lovlar kassada realizatsiya bo'lib qoladi (lib/kassa).
  const scope = branchFilter(user);
  const cancelledAt = new Date();
  const sale = await Sale.findOneAndUpdate(
    { _id: saleId, ...scope, status: { $ne: 'cancelled' } },
    { $set: { status: 'cancelled', remainingAmount: 0, cancelledAt, cancelledBy: user.username } },
    { new: false }
  ).lean();
  if (!sale) {
    const exists = await Sale.exists({ _id: saleId, ...scope });
    return { ok: false, error: exists ? 'alreadyCancelled' : 'saleNotFound' };
  }

  // To'langan pul (qisman qaytarishda qaytgani ayirilgan) mijozga naqd qaytariladi —
  // Moliya'da «Sotuv bekor qilindi» chiqimi: Hisoblar holati, smena va kirim-chiqimda kassadan ayiriladi
  const refund = Math.max(0, sale.paidAmount);
  await Sale.updateOne({ _id: sale._id }, { $set: { cancelRefund: refund } });
  if (refund > 0) {
    try {
      await FinanceCategory.updateOne(
        { type: 'expense', name: SALE_CANCEL_CATEGORY },
        { $setOnInsert: { system: true, active: true } },
        { upsert: true },
      ).catch(() => { /* parallel upsert — unikal indeks */ });
      const shift = await CashShift.findOne({ branchId: sale.branchId, status: 'open' }).select('_id').lean();
      const customer = sale.customerSnapshot?.fullName;
      await CashFlow.create({
        type: 'expense',
        amount: refund,
        description: `${sale.saleNo} bekor qilindi — mijozga qaytarildi: ${sale.productSnapshot?.name ?? ''}${customer ? `, ${customer}` : ''}`.slice(0, 300),
        category: SALE_CANCEL_CATEGORY,
        branchId: sale.branchId,
        ...(shift ? { shiftId: shift._id } : {}),
        saleId: sale._id,
        recordedBy: user.username,
      });
    } catch (err) {
      // Sotuv bekor bo'ldi, lekin chiqim yozilmadi — audit/logda ko'rinadi, qo'lda kiritiladi
      logError('cancelSaleAction refund cashflow failed', err, { user: user.username, dbName: user.dbName, saleNo: sale.saleNo });
    }
  }

  if (sale.productId) {
    const saleQty = sale.productSnapshot?.saleQuantity ?? 1;
    await releaseStock(Product, sale.productId, saleQty, {
      action: 'returned',
      detail: `Sotuv ${sale.saleNo} bekor qilindi`,
      by: user.username,
      at: new Date(),
    });
  }

  await recordAudit(user, {
    action: 'sale.cancel',
    entity: 'sale',
    entityId: saleId,
    summary: `Sotuv bekor qilindi: ${sale.saleNo} · ${sale.productSnapshot?.name ?? ''} · ${sale.totalAmount.toLocaleString('uz-UZ')} so'm`
      + (refund > 0 ? ` · mijozga qaytarildi ${refund.toLocaleString('uz-UZ')} so'm (kassadan chiqim)` : ''),
    meta: { paidAmount: sale.paidAmount, paymentType: sale.paymentType, totalAmount: sale.totalAmount, refund },
  });

  return { ok: true, saleNo: sale.saleNo, refund };
}

/**
 * Qisman qaytarish — sotuvdan bir necha dona omborga qaytadi, summa kamayadi.
 * Avval qarz kamayadi, ortig'i mijozga naqd qaytariladi (kunlik kassada chiqim bo'lib ko'rinadi).
 */
export async function returnSaleItems(
  m: Pick<Models, 'Sale' | 'Product'>,
  user: SessionUser,
  input: { saleId: string; qty: number; reason?: string },
): Promise<{ ok: true; saleNo: string; qty: number; unit?: string; refundAmount: number } | { ok: false; error: SaleUndoError }> {
  const { Product, Sale } = m;
  const { saleId, reason } = input;
  const returnQty = input.qty;
  const scope = branchFilter(user);
  const sale = await Sale.findOne({ _id: saleId, ...scope }).lean();
  if (!sale) return { ok: false, error: 'saleNotFound' };

  const qty = sale.productSnapshot?.saleQuantity ?? 1;
  const unit = sale.productSnapshot?.unit;
  const res = computePartialReturn({
    qty,
    unit,
    totalAmount: sale.totalAmount,
    paidAmount: sale.paidAmount,
    remainingAmount: sale.remainingAmount,
    paymentType: sale.paymentType,
    status: sale.status,
    bankParts: sale.bankParts,
  }, returnQty);
  if (!res.ok) {
    const err = ({ cancelled: 'alreadyCancelled', bankCredit: 'returnBankCredit', badQty: 'returnBadQty', useCancel: 'returnUseCancel' } as const)[res.error];
    return { ok: false, error: err };
  }
  const c = res.calc;
  const now = new Date();

  // Optimistik qulf: sotuv o'qilgandan beri o'zgarmagan bo'lsagina yoziladi —
  // ikki marta bosish yoki parallel to'lov ikki marta qaytarishga olib kelmaydi.
  const updated = await Sale.findOneAndUpdate(
    {
      _id: saleId,
      ...scope,
      status: { $ne: 'cancelled' },
      totalAmount: sale.totalAmount,
      paidAmount: sale.paidAmount,
      remainingAmount: sale.remainingAmount,
      'productSnapshot.saleQuantity': qty, // qisman qaytarish faqat qty > 1 da — maydon doim bor
    },
    {
      $set: {
        'productSnapshot.saleQuantity': c.newQty,
        totalAmount: c.newTotal,
        paidAmount: c.newPaid,
        remainingAmount: c.newRemaining,
        status: c.newStatus,
      },
      $push: {
        returns: {
          qty: returnQty,
          amount: c.amount,
          debtReduced: c.debtReduced,
          refundAmount: c.refundAmount,
          reason: reason || undefined,
          returnedAt: now,
          by: user.username,
        },
      },
    },
    { new: true }
  ).lean();
  if (!updated) return { ok: false, error: 'returnConflict' };

  if (sale.productId) {
    await releaseStock(Product, sale.productId, returnQty, {
      action: 'returned',
      detail: `Sotuv ${sale.saleNo}: ${qtyLabel(returnQty, unit)} qaytarildi`,
      by: user.username,
      at: now,
    });
  }

  await recordAudit(user, {
    action: 'sale.return',
    entity: 'sale',
    entityId: saleId,
    summary: `Qaytarish: ${sale.saleNo} · ${qtyLabel(returnQty, unit)} · ${c.amount.toLocaleString('uz-UZ')} so'm (naqd qaytarildi ${c.refundAmount.toLocaleString('uz-UZ')} so'm)`,
    meta: { qty: returnQty, amount: c.amount, debtReduced: c.debtReduced, refundAmount: c.refundAmount, reason },
  });

  return { ok: true, saleNo: sale.saleNo, qty: returnQty, unit, refundAmount: c.refundAmount };
}

export function saleUndoErrorText(e: SaleUndoError, d: Dict): string {
  return d.sales.actions[e];
}
