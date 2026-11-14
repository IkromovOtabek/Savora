import { recordAudit } from './audit';
import { isBranchScoped } from './branchScope';
import { nextDocNo } from './counters';
import { computeShiftTotals, isDuplicateKeyError, type ShiftTotals } from './cashShift';
import { fmtMoney } from './format';
import { tr } from './i18n/fmt';
import type { Dict } from './i18n/dict';
import type { SessionUser } from './session';
import type { getTenantModels } from './tenantDb';
import { SHIFT_DEPOSIT_CATEGORY, SHIFT_WITHDRAW_CATEGORY } from './models/tenant/FinanceCategory';
import { notifyShiftClosed } from './shopNotify';

/**
 * Kassa smenasi amallari — web server action'lari va mobil API uchun umumiy.
 * Kirish (zod) va huquq/modul tekshiruvi chaqiruvchida; bu yerda — biznes mantiq va audit.
 */
type Models = Pick<Awaited<ReturnType<typeof getTenantModels>>, 'Branch' | 'CashShift' | 'Sale' | 'CashFlow'>;
type ShiftDict = Dict['sales']['shifts'];
export type ShiftOpResult = { error: string } | { success: string };

/** Ochiq smena uchun joriy kassa: ochilishdan `now` gacha bo'lgan naqd harakatlar */
export async function shiftTotalsNow(
  m: Pick<Models, 'Sale' | 'CashFlow'>,
  shift: { branchId: unknown; openedAt: Date; openingCash: number },
  now = new Date(),
): Promise<ShiftTotals> {
  const from = new Date(shift.openedAt);
  const [sales, flows] = await Promise.all([
    m.Sale.find({ branchId: shift.branchId, $or: [{ 'payments.paidAt': { $gte: from } }, { 'returns.returnedAt': { $gte: from } }] }).lean(),
    m.CashFlow.find({ branchId: shift.branchId, createdAt: { $gte: from } }).select('type amount createdAt').lean(),
  ]);
  return computeShiftTotals(sales, flows, shift.openingCash, from, now);
}

export async function openShift(
  user: SessionUser, m: Models, k: ShiftDict,
  { branchId, openingCash, via = '' }: { branchId: string; openingCash: number; via?: string },
): Promise<ShiftOpResult> {
  // Filial xodimi faqat o'z filialida smena ochadi
  if (isBranchScoped(user) && user.branchId !== branchId) return { error: k.badBranch };
  const branch = await m.Branch.findOne({ _id: branchId, active: true }).select('name').lean();
  if (!branch) return { error: k.badBranch };

  try {
    const shiftNo = await nextDocNo(m.CashShift, 'shiftNo', 'shift', 'K');
    const shift = await m.CashShift.create({ shiftNo, branchId, status: 'open', openedAt: new Date(), openedBy: user.username, openingCash });
    await recordAudit(user, {
      action: 'shift.open',
      entity: 'finance',
      entityId: String(shift._id),
      summary: `Smena ${shiftNo} ochildi — ${branch.name}, ${fmtMoney(openingCash)} so'm${via}`,
      meta: { branchId, openingCash },
    });
    return { success: tr(k.opened, { no: shiftNo }) };
  } catch (e) {
    // Qisman unikal indeks: shu filialda ochiq smena allaqachon bor (parallel bosish ham)
    if (isDuplicateKeyError(e)) return { error: k.alreadyOpen };
    return { error: k.failed };
  }
}

export async function closeShift(
  user: SessionUser, m: Models, k: ShiftDict,
  { shiftId, countedCash, note, via = '' }: { shiftId: string; countedCash: number; note?: string; via?: string },
): Promise<ShiftOpResult> {
  const shift = await m.CashShift.findOne({ _id: shiftId, status: 'open' }).lean();
  if (!shift) return { error: k.notFound };
  if (isBranchScoped(user) && String(shift.branchId) !== user.branchId) return { error: k.notFound };

  const closedAt = new Date();
  const totals = await shiftTotalsNow(m, shift, closedAt);
  const difference = countedCash - totals.current;

  // Atomik: faqat hali ochiq smena yopiladi (ikki marta yopish mumkin emas)
  const updated = await m.CashShift.findOneAndUpdate(
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
    summary: `Smena ${shift.shiftNo} yopildi — kerak ${fmtMoney(totals.current)}, sanaldi ${fmtMoney(countedCash)}, farq ${fmtMoney(difference)} so'm${via}`,
    meta: { ...totals, countedCash, difference },
  });
  // Farq bo'lsa — egaga Telegram (sozlamada yoqilgan bo'lsa); javobni kutmaydi
  if (difference !== 0) {
    const branch = await m.Branch.findById(shift.branchId).select('name').lean();
    void notifyShiftClosed(user, {
      shiftNo: shift.shiftNo, branch: branch?.name ?? '—', by: user.username,
      expected: totals.current, counted: countedCash, difference,
    });
  }
  return { success: tr(k.closed, { no: shift.shiftNo }) };
}

/** Smena ichida kassa operatsiyasi: kassaga pul qo'shish yoki olish (CashFlow + filial + smena) */
export async function shiftCashOp(
  user: SessionUser, m: Models, k: ShiftDict,
  { shiftId, type, amount, note, via = '' }: { shiftId: string; type: 'income' | 'expense'; amount: number; note?: string; via?: string },
): Promise<ShiftOpResult> {
  const shift = await m.CashShift.findOne({ _id: shiftId, status: 'open' }).lean();
  if (!shift) return { error: k.notFound };
  if (isBranchScoped(user) && String(shift.branchId) !== user.branchId) return { error: k.notFound };

  // Olishda — kassadagi puldan oshmasin
  if (type === 'expense') {
    const { current } = await shiftTotalsNow(m, shift);
    if (amount > current) return { error: tr(k.opTooMuch, { v: fmtMoney(current) }) };
  }

  const entry = await m.CashFlow.create({
    type,
    amount,
    description: note || (type === 'income' ? k.deposits : k.withdrawals),
    category: type === 'income' ? SHIFT_DEPOSIT_CATEGORY : SHIFT_WITHDRAW_CATEGORY,
    branchId: shift.branchId,
    shiftId: shift._id,
    recordedBy: user.username,
  });
  await recordAudit(user, {
    action: type === 'income' ? 'shift.deposit' : 'shift.withdraw',
    entity: 'finance',
    entityId: String(entry._id),
    summary: `Smena ${shift.shiftNo}: ${type === 'income' ? 'kassaga qo\'shildi' : 'kassadan olindi'} ${fmtMoney(amount)} so'm${note ? ` — ${note}` : ''}${via}`,
    meta: { shiftId, type, amount },
  });
  return { success: k.opDone };
}
