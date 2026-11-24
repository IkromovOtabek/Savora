import { recordAudit } from './audit';
import { isBranchScoped } from './branchScope';
import { shiftTotalsNow } from './cashShiftOps';
import { fmtMoney } from './format';
import { tr } from './i18n/fmt';
import type { Dict } from './i18n/dict';
import type { SessionUser } from './session';
import type { getTenantModels } from './tenantDb';

/**
 * Filial xodimining xarajati — web (kassa, bosh sahifa) va mobil API uchun umumiy.
 * Pul o'z filiali naqd kassasidan chiqadi: toifali CashFlow chiqimi, Hisobotdagi sof foydadan ayiriladi.
 * Filialda ochiq smena bo'lsa — yozuv smenaga bog'lanadi va summa smena kassasidagi puldan oshmaydi;
 * smenasiz do'konda cheklov yo'q (egasining «Xarajat qo'shish» i kabi).
 * Huquq (kassa.expense) va modul tekshiruvi chaqiruvchida; bu yerda — biznes mantiq va audit.
 */
type Models = Pick<Awaited<ReturnType<typeof getTenantModels>>, 'Branch' | 'CashShift' | 'Sale' | 'CashFlow' | 'FinanceCategory'>;
export type BranchExpenseDict = { fin: Dict['sales']['fin']; shifts: Dict['sales']['shifts'] };
export type BranchExpenseResult = { error: string } | { success: string };

export async function addBranchExpense(
  user: SessionUser, m: Models, d: BranchExpenseDict,
  { amount, category, note, via = '' }: { amount: number; category: string; note?: string; via?: string },
): Promise<BranchExpenseResult> {
  // Faqat filial login — egasi filialni o'zi tanlaydigan «Xarajat qo'shish» dan foydalanadi
  if (!isBranchScoped(user)) return { error: d.shifts.badBranch };
  const branch = await m.Branch.findOne({ _id: user.branchId, active: true }).select('name').lean();
  if (!branch) return { error: d.shifts.badBranch };

  // Tizim toifalari (kassaga qo'shildi/olindi, sotuv bekor qilindi …) qo'lda tanlanmaydi
  const okCategory = await m.FinanceCategory.exists({ name: category, type: 'expense', active: true, system: { $ne: true } });
  if (!okCategory) return { error: d.fin.badCategory };

  const shift = await m.CashShift.findOne({ branchId: user.branchId, status: 'open' }).lean();
  if (shift) {
    const { current } = await shiftTotalsNow(m, shift);
    if (amount > current) return { error: tr(d.shifts.opTooMuch, { v: fmtMoney(current) }) };
  }

  try {
    const entry = await m.CashFlow.create({
      type: 'expense', amount, category, description: note || category,
      branchId: user.branchId, recordedBy: user.username,
      ...(shift ? { shiftId: shift._id } : {}),
    });
    await recordAudit(user, {
      action: 'finance.expense',
      entity: 'finance',
      entityId: String(entry._id),
      summary: `Chiqim (${category}): ${fmtMoney(amount)} so'm — ${note || category} · ${branch.name}${shift ? `, smena ${shift.shiftNo}` : ''}${via}`,
      meta: { type: 'expense', amount, category, branchId: user.branchId, ...(shift ? { shiftId: String(shift._id) } : {}), branchStaff: true },
    });
    return { success: tr(d.fin.qeAdded, { sum: fmtMoney(amount), cat: category }) };
  } catch {
    return { error: d.shifts.failed };
  }
}
