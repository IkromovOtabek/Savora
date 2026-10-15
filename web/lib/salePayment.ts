import type { Model, Types } from 'mongoose';
import type { ISale } from './models/tenant/Sale';

/**
 * Sotuvga to'lov qo'shish — ATOMIK. Qoldiq sharti (`remainingAmount >= amount`) va yozuv
 * bitta `findOneAndUpdate` da: ikki parallel to'lov qoldiqdan oshib keta olmaydi.
 * So'ng to'liq to'langan bo'lsa status `paid` ga o'tkaziladi.
 *
 * @returns yangilangan { paidAmount, remainingAmount, status } yoki null (shart bajarilmadi)
 */
export async function applySalePayment(
  Sale: Model<ISale>,
  saleId: string | Types.ObjectId,
  amount: number,
  opts: { scope?: Record<string, unknown>; note?: string; recordedBy?: string } = {}
): Promise<{ paidAmount: number; remainingAmount: number; status: ISale['status'] } | null> {
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;

  const updated = await Sale.findOneAndUpdate(
    {
      _id: saleId,
      ...(opts.scope ?? {}),
      status: 'partial',
      remainingAmount: { $gte: amount },
    },
    {
      $inc: { paidAmount: amount, remainingAmount: -amount },
      $push: { payments: { amount, paidAt: new Date(), note: opts.note, recordedBy: opts.recordedBy } },
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
  return { paidAmount: updated.paidAmount, remainingAmount, status };
}
