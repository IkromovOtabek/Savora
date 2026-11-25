import { recordCashFlow } from './cashFlowEntry';
import { isBranchScoped } from './branchScope';
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
  // Toifa, smena (kassadagi puldan oshmaydi) va audit — lib/cashFlowEntry (egasining xarajati bilan bir qoida)
  const res = await recordCashFlow(m, user, { type: 'expense', amount, category, description: note, branchId: user.branchId, source: 'branch', via });
  if (!res.ok) {
    if (res.error.code === 'badCategory') return { error: d.fin.badCategory };
    if (res.error.code === 'opTooMuch') return { error: tr(d.shifts.opTooMuch, { v: fmtMoney(res.error.current) }) };
    if (res.error.code === 'badBranch') return { error: d.shifts.badBranch };
    return { error: d.shifts.failed };
  }
  return { success: tr(d.fin.qeAdded, { sum: fmtMoney(amount), cat: category }) };
}
