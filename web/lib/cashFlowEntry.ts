/**
 * Kirim / chiqim yozuvi (CashFlow) — YAGONA yo'l: Moliya → tranzaksiya, egasining «Xarajat qo'shish»i,
 * filial xodimining xarajati (lib/branchExpense) va mobil kirim-chiqim. Avval to'rt joyda har xil qoida edi.
 *
 * Qoidalar:
 * - Toifa berilsa — faol va tizimdan tashqari (smena, sotuv bekor qilish toifalari qo'lda tanlanmaydi).
 * - Toifasiz chiqim — «Boshqa xarajat» (sof foydadan ayiriladi; web va mobil foydasi bir xil bo'lsin).
 *   Toifasiz kirim — toifasiz (foydaga kirmaydi).
 * - Filialda ochiq smena bo'lsa — yozuv smenaga bog'lanadi; chiqim smena kassasidagi puldan oshmaydi.
 */
import type { SessionUser } from './session';
import type { getTenantModels } from './tenantDb';
import { OTHER_EXPENSE_CATEGORY } from './models/tenant/FinanceCategory';
import { shiftTotalsNow } from './cashShiftOps';
import { recordAudit } from './audit';
import { fmtMoney } from './format';

type Models = Pick<Awaited<ReturnType<typeof getTenantModels>>, 'Branch' | 'CashShift' | 'Sale' | 'CashFlow' | 'FinanceCategory'>;

export type CashFlowEntryError =
  | { code: 'badCategory' | 'badBranch' | 'failed' }
  | { code: 'opTooMuch'; current: number };

export interface CashFlowEntryInput {
  type: 'income' | 'expense';
  amount: number;
  category?: string;
  /** Izoh (bo'sh — toifa nomi) */
  description?: string;
  branchId?: string;
  source: 'finance' | 'quick' | 'branch' | 'mobile';
  /** Audit izohiga qo'shimcha (masalan « (mobil)») */
  via?: string;
}

export async function recordCashFlow(
  m: Models,
  user: SessionUser,
  input: CashFlowEntryInput,
): Promise<{ ok: true; id: string; category?: string; shiftNo?: string } | { ok: false; error: CashFlowEntryError }> {
  const { type, amount, branchId } = input;
  let category = input.category?.trim() || undefined;
  if (category) {
    const ok = await m.FinanceCategory.exists({ name: category, type, active: true, system: { $ne: true } });
    if (!ok) return { ok: false, error: { code: 'badCategory' } };
  } else if (type === 'expense') {
    category = OTHER_EXPENSE_CATEGORY;
    await m.FinanceCategory.updateOne(
      { name: category, type: 'expense' },
      { $setOnInsert: { name: category, type: 'expense', active: true } },
      { upsert: true },
    ).catch(() => { /* parallel upsert — unikal indeks */ });
  }

  let branchName: string | undefined;
  if (branchId) {
    const branch = await m.Branch.findOne({ _id: branchId, active: true }).select('name').lean();
    if (!branch) return { ok: false, error: { code: 'badBranch' } };
    branchName = branch.name;
  }

  // Filial kassasida ochiq smena — yozuv smenaga; chiqim kassadagi puldan oshmasin
  const shift = branchId ? await m.CashShift.findOne({ branchId, status: 'open' }).lean() : null;
  if (shift && type === 'expense') {
    const { current } = await shiftTotalsNow(m, shift);
    if (amount > current) return { ok: false, error: { code: 'opTooMuch', current } };
  }

  const description = input.description?.trim() || category || '';
  try {
    const entry = await m.CashFlow.create({
      type, amount, description, recordedBy: user.username,
      ...(category ? { category } : {}),
      ...(branchId ? { branchId } : {}),
      ...(shift ? { shiftId: shift._id } : {}),
    });
    await recordAudit(user, {
      action: type === 'income' ? 'finance.income' : 'finance.expense',
      entity: 'finance',
      entityId: String(entry._id),
      summary: `${type === 'income' ? 'Kirim' : 'Chiqim'}${category ? ` (${category})` : ''}: ${fmtMoney(amount)} so'm — ${description}`
        + `${branchName ? ` · ${branchName}` : ''}${shift ? `, smena ${shift.shiftNo}` : ''}${input.via ?? ''} [${input.source}]`,
      meta: { type, amount, category, branchId, source: input.source, ...(shift ? { shiftId: String(shift._id) } : {}) },
    });
    return { ok: true, id: String(entry._id), category, shiftNo: shift?.shiftNo };
  } catch {
    return { ok: false, error: { code: 'failed' } };
  }
}
