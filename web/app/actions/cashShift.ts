'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getTenantSession } from '@/lib/tenantSession';
import { recordAudit } from '@/lib/audit';
import { featureDisabledError } from '@/lib/featureAction';
import { checkPermission } from '@/lib/permissionGuard';
import { isBranchScoped } from '@/lib/branchScope';
import { nextDocNo } from '@/lib/counters';
import { computeShiftTotals, isDuplicateKeyError } from '@/lib/cashShift';
import { formToObject, parseInput, zId, zMoney, zText } from '@/lib/validation';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import { fmtMoney } from '@/lib/format';

type State = { error?: string; success?: string } | null;

export async function openShiftAction(_prev: State, formData: FormData): Promise<State> {
  const { user, features, Branch, CashShift } = await getTenantSession();
  if (!features.kassa) return featureDisabledError('kassa');
  const denied = await checkPermission(user, 'kassa.shift');
  if (denied) return denied;
  const k = (await getDict()).sales.shifts;

  const parsed = parseInput(z.object({
    branchId: zId(k.badBranch),
    openingCash: zMoney(k.badAmount, { min: 0 }),
  }), formToObject(formData), k.badAmount);
  if (!parsed.ok) return { error: parsed.error };
  const { branchId, openingCash } = parsed.data;

  // Filial xodimi faqat o'z filialida smena ochadi
  if (isBranchScoped(user) && user.branchId !== branchId) return { error: k.badBranch };
  const branch = await Branch.findOne({ _id: branchId, active: true }).select('name').lean();
  if (!branch) return { error: k.badBranch };

  try {
    const shiftNo = await nextDocNo(CashShift, 'shiftNo', 'shift', 'K');
    const shift = await CashShift.create({ shiftNo, branchId, status: 'open', openedAt: new Date(), openedBy: user.username, openingCash });
    await recordAudit(user, {
      action: 'shift.open',
      entity: 'finance',
      entityId: String(shift._id),
      summary: `Smena ${shiftNo} ochildi — ${branch.name}, ${fmtMoney(openingCash)} so'm`,
      meta: { branchId, openingCash },
    });
    revalidatePath('/app/shifts');
    return { success: tr(k.opened, { no: shiftNo }) };
  } catch (e) {
    // Qisman unikal indeks: shu filialda ochiq smena allaqachon bor (parallel bosish ham)
    if (isDuplicateKeyError(e)) return { error: k.alreadyOpen };
    return { error: k.failed };
  }
}

export async function closeShiftAction(_prev: State, formData: FormData): Promise<State> {
  const { user, features, Sale, CashFlow, CashShift } = await getTenantSession();
  if (!features.kassa) return featureDisabledError('kassa');
  const denied = await checkPermission(user, 'kassa.shift');
  if (denied) return denied;
  const k = (await getDict()).sales.shifts;

  const parsed = parseInput(z.object({
    shiftId: zId(k.notFound),
    countedCash: zMoney(k.badAmount, { min: 0 }),
    note: zText(300),
  }), formToObject(formData), k.badAmount);
  if (!parsed.ok) return { error: parsed.error };
  const { shiftId, countedCash, note } = parsed.data;

  const shift = await CashShift.findOne({ _id: shiftId, status: 'open' }).lean();
  if (!shift) return { error: k.notFound };
  if (isBranchScoped(user) && String(shift.branchId) !== user.branchId) return { error: k.notFound };

  const closedAt = new Date();
  const from = new Date(shift.openedAt);
  const [sales, flows] = await Promise.all([
    Sale.find({
      branchId: shift.branchId,
      $or: [{ 'payments.paidAt': { $gte: from } }, { 'returns.returnedAt': { $gte: from } }],
    }).lean(),
    CashFlow.find({ branchId: shift.branchId, type: 'expense', createdAt: { $gte: from } }).select('type amount createdAt').lean(),
  ]);
  const totals = computeShiftTotals(sales, flows, shift.openingCash, from, closedAt);
  const difference = countedCash - totals.current;

  // Atomik: faqat hali ochiq smena yopiladi (ikki marta yopish mumkin emas)
  const updated = await CashShift.findOneAndUpdate(
    { _id: shiftId, status: 'open' },
    {
      $set: {
        status: 'closed', closedAt, closedBy: user.username,
        expectedCash: totals.current, countedCash, difference, note: note || undefined,
      },
    },
    { new: true },
  ).lean();
  if (!updated) return { error: k.notFound };

  await recordAudit(user, {
    action: 'shift.close',
    entity: 'finance',
    entityId: shiftId,
    summary: `Smena ${shift.shiftNo} yopildi — kerak ${fmtMoney(totals.current)}, sanaldi ${fmtMoney(countedCash)}, farq ${fmtMoney(difference)} so'm`,
    meta: { ...totals, countedCash, difference },
  });
  revalidatePath('/app/shifts');
  return { success: tr(k.closed, { no: shift.shiftNo }) };
}
