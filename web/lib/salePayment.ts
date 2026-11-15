import { Types, type Model } from 'mongoose';
import type { ISale, ISalePayment } from './models/tenant/Sale';
import type { PayMethod } from './payMethods';

/**
 * Sotuvga to'lov qo'shish — ATOMIK. Qoldiq sharti (`remainingAmount >= amount`) va yozuv
 * bitta `findOneAndUpdate` da: ikki parallel to'lov qoldiqdan oshib keta olmaydi.
 * So'ng to'liq to'langan bo'lsa status `paid` ga o'tkaziladi.
 *
 * `expectPaid` — optimistik qulf: to'lov faqat `paidAmount` hali shu qiymatda bo'lsa yoziladi
 * (nasiya jadvali/izoh/qoldiq shu holatdan hisoblangan — parallel to'lov ularni eskirtirmasin).
 * `extra` — to'lov yozuviga qo'shimcha (oylar, keyingi oylarga o'tgan summa, qoldiq);
 * `set` — sotuvning o'ziga (masalan, qayta bo'lingan oy summalari).
 *
 * @returns yangilangan { paidAmount, remainingAmount, status, paymentId } yoki null (shart bajarilmadi)
 */
export async function applySalePayment(
  Sale: Model<ISale>,
  saleId: string | Types.ObjectId,
  amount: number,
  opts: {
    scope?: Record<string, unknown>;
    note?: string;
    recordedBy?: string;
    method?: PayMethod;
    expectPaid?: number;
    extra?: Pick<ISalePayment, 'months' | 'carry' | 'balanceAfter'>;
    set?: Partial<Pick<ISale, 'installmentAmounts'>>;
  } = {}
): Promise<{ paidAmount: number; remainingAmount: number; status: ISale['status']; paymentId: string } | null> {
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;

  const paymentId = new Types.ObjectId();
  const updated = await Sale.findOneAndUpdate(
    {
      _id: saleId,
      ...(opts.scope ?? {}),
      status: 'partial',
      remainingAmount: { $gte: amount },
      ...(typeof opts.expectPaid === 'number' ? { paidAmount: opts.expectPaid } : {}),
    },
    {
      $inc: { paidAmount: amount, remainingAmount: -amount },
      $push: {
        payments: {
          _id: paymentId,
          amount,
          paidAt: new Date(),
          note: opts.note,
          recordedBy: opts.recordedBy,
          ...(opts.method ? { method: opts.method } : {}),
          ...(opts.extra ?? {}),
        },
      },
      ...(opts.set && Object.keys(opts.set).length > 0 ? { $set: opts.set } : {}),
    },
    { new: true }
  ).lean();
  if (!updated) return null;

  let status = updated.status;
  let remainingAmount = updated.remainingAmount;
  if (updated.paidAmount >= updated.totalAmount || updated.remainingAmount <= 0) {
    await Sale.updateOne(
      { _id: updated._id, status: 'partial' },
      { $set: { status: 'paid', remainingAmount: 0 } }
    );
    status = 'paid';
    remainingAmount = 0;
  }
  return { paidAmount: updated.paidAmount, remainingAmount, status, paymentId: String(paymentId) };
}
