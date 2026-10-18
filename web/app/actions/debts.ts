'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { Types } from 'mongoose';
import { getTenantSession } from '@/lib/tenantSession';
import { recordAudit } from '@/lib/audit';
import { checkPermission } from '@/lib/permissionGuard';
import { branchFilter } from '@/lib/branchScope';
import { applySalePayment } from '@/lib/salePayment';
import { allocatePayment } from '@/lib/debtLedger';
import { runWithCompensation } from '@/lib/compensate';
import { logError } from '@/lib/logger';
import { parseInput, zId, zMoney } from '@/lib/validation';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import { fmtMoney } from '@/lib/format';

type State = { error?: string; success?: string } | null;

/**
 * Ommaviy to'lov: mijozning ochiq qarzlariga summa eng eski (muddati yaqin) qarzdan boshlab
 * taqsimlanadi. Har to'lov atomik (applySalePayment); biri o'tmasa — oldingilari qaytariladi.
 */
export async function bulkDebtPaymentAction(input: { customerId: string; amount: number }): Promise<State> {
  const { user, Sale } = await getTenantSession();
  const denied = await checkPermission(user, 'payment.accept');
  if (denied) return denied;
  const d = await getDict();
  const k = d.sales.debts;
  const m = d.sales.actions;

  const parsed = parseInput(z.object({
    customerId: zId(m.saleNotFound),
    amount: zMoney(m.badPaymentAmount, { min: 1 }),
  }), input, m.badPaymentAmount);
  if (!parsed.ok) return { error: parsed.error };
  const { customerId, amount } = parsed.data;
  const scope = branchFilter(user);

  const debts = await Sale.find({ ...scope, customerId: new Types.ObjectId(customerId), status: 'partial', remainingAmount: { $gt: 0 } })
    .sort({ dueDate: 1, createdAt: 1 })
    .select('saleNo remainingAmount customerSnapshot')
    .lean();
  const total = debts.reduce((s, x) => s + x.remainingAmount, 0);
  const plan = allocatePayment(debts.map((x) => ({ id: String(x._id), remaining: x.remainingAmount })), amount);
  if (!plan) return { error: tr(k.bulkTooMuch, { sum: fmtMoney(total) }) };
  const name = debts[0]?.customerSnapshot?.fullName ?? '—';

  const outcome = await runWithCompensation(plan, async (part) => {
    const res = await applySalePayment(Sale, part.id, part.amount, { scope, note: k.bulkNote, recordedBy: user.username });
    if (!res) return null;
    return {
      result: part,
      // Bekor qilish: oxirgi to'lov olib tashlanadi, summa qaytariladi, holat "qisman"
      undo: async () => {
        await Sale.updateOne(
          { _id: part.id },
          { $inc: { paidAmount: -part.amount, remainingAmount: part.amount }, $set: { status: 'partial' }, $pop: { payments: 1 } },
        );
      },
    };
  });
  if (!outcome.ok) {
    if (outcome.error) logError('bulkDebtPaymentAction failed', outcome.error, { user: user.username, dbName: user.dbName });
    return { error: k.bulkConflict };
  }

  const bySale = new Map(debts.map((x) => [String(x._id), x.saleNo]));
  await recordAudit(user, {
    action: 'sale.bulkPayment',
    entity: 'customer',
    entityId: customerId,
    summary: `Ommaviy to'lov: ${name} · ${fmtMoney(amount)} so'm → ${outcome.results.map((r) => `${bySale.get(r.id)} ${fmtMoney(r.amount)}`).join(', ')}`,
    meta: { amount, parts: outcome.results },
  });
  revalidatePath('/app/debts');
  revalidatePath('/app/sales');
  revalidatePath(`/app/customers/${customerId}`);
  revalidatePath('/app');
  return { success: tr(k.bulkDone, { name, sum: fmtMoney(amount), n: outcome.results.length }) };
}
