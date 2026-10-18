'use server';

import { revalidatePath } from 'next/cache';
import { getTenantAdminSession } from '@/lib/tenantSession';
import { recordAudit } from '@/lib/audit';
import { featureDisabledError } from '@/lib/featureAction';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import { z } from 'zod';
import { formToObject, parseInput, zId, zMoney, zOneOf, zOptId, zReqText, zText } from '@/lib/validation';
import { softDeleteOne } from '@/lib/softDelete';

type State = { error?: string; success?: string } | null;

function fmtSum(n: number): string {
  return new Intl.NumberFormat('uz-UZ').format(n) + ' so\'m';
}

export async function createCreditBankAction(_prev: State, formData: FormData): Promise<State> {
  const { CreditBank, features } = await getTenantAdminSession();
  if (!features.creditKassa) return featureDisabledError('creditKassa');
  const d = await getDict();
  const m = d.sales.actions;
  const parsed = parseInput(zReqText(80, m.bankNameRequired, d.common.tooLong), formData.get('name'));
  if (!parsed.ok) return { error: parsed.error };
  const name = parsed.data;

  const dup = await CreditBank.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).lean();
  if (dup) return { error: m.bankExists };

  try {
    await CreditBank.create({ name, active: true });
    revalidatePath('/app/kredit-kassa');
    return { success: tr(m.bankAdded, { name }) };
  } catch {
    return { error: m.bankAddFailed };
  }
}

export async function toggleCreditBankAction(formData: FormData): Promise<void> {
  const { CreditBank, features } = await getTenantAdminSession();
  if (!features.creditKassa) return;
  const id = parseInput(zId('bad'), formData.get('bankId'));
  if (!id.ok) return;
  const bankId = id.data;
  const active = formData.get('active') === '1';

  await CreditBank.findByIdAndUpdate(bankId, { active });
  revalidatePath('/app/kredit-kassa');
}

export async function deleteCreditBankAction(formData: FormData): Promise<void> {
  const { CreditBank, features } = await getTenantAdminSession();
  if (!features.creditKassa) return;
  const id = parseInput(zId('bad'), formData.get('bankId'));
  if (!id.ok) return;
  const bankId = id.data;

  await CreditBank.findByIdAndDelete(bankId);
  revalidatePath('/app/kredit-kassa');
}

export async function createCashFlowAction(_prev: State, formData: FormData): Promise<State> {
  const { user, CashFlow, features } = await getTenantAdminSession();
  if (!features.kirimChiqim) return featureDisabledError('kirimChiqim');
  const d = await getDict();
  const m = d.sales.actions;
  const parsed = parseInput(z.object({
    type: zOneOf(['income', 'expense'] as const, m.badType),
    description: zReqText(300, m.descriptionRequired, d.common.tooLong),
    // Butun so'm — kasr summalar rad etiladi
    amount: zMoney(m.badAmount, { min: 1 }),
  }), formToObject(formData), m.badAmount);
  if (!parsed.ok) return { error: parsed.error };
  const { type, description, amount } = parsed.data;

  try {
    const entry = await CashFlow.create({ type, amount, description, recordedBy: user.username });
    await recordAudit(user, {
      action: type === 'income' ? 'finance.income' : 'finance.expense',
      entity: 'finance',
      entityId: String(entry._id),
      summary: `${type === 'income' ? 'Kirim' : 'Chiqim'}: ${fmtSum(amount)} — ${description}`,
      meta: { type, amount },
    });
    revalidatePath('/app/kirim-chiqim');
    return { success: type === 'income' ? m.incomeAdded : m.expenseAdded };
  } catch {
    return { error: m.saveFailed };
  }
}

export async function deleteCashFlowAction(formData: FormData): Promise<void> {
  const { user, CashFlow, features } = await getTenantAdminSession();
  if (!features.kirimChiqim) return;
  const id = parseInput(zId('bad'), formData.get('entryId'));
  if (!id.ok) return;
  const entryId = id.data;

  const deleted = await softDeleteOne(CashFlow, { _id: entryId }, user.username);
  await recordAudit(user, {
    action: 'finance.delete',
    entity: 'finance',
    entityId: entryId,
    summary: deleted
      ? `${deleted.type === 'income' ? 'Kirim' : 'Chiqim'} o'chirildi: ${fmtSum(deleted.amount)} — ${deleted.description}`
      : `Kirim/chiqim o'chirildi: ${entryId}`,
  });
  revalidatePath('/app/kirim-chiqim');
  revalidatePath('/app/finance');
  revalidatePath('/app/finance/state');
}

/** Moliyaviy yozuv (web): turi, summa, toifa, izoh, ixtiyoriy filial */
export async function createFinanceTxAction(_prev: State, formData: FormData): Promise<State> {
  const { user, CashFlow, Branch, FinanceCategory, features } = await getTenantAdminSession();
  if (!features.kirimChiqim) return featureDisabledError('kirimChiqim');
  const d = await getDict();
  const m = d.sales.actions;
  const f = d.sales.fin;
  const parsed = parseInput(z.object({
    type: zOneOf(['income', 'expense'] as const, m.badType),
    amount: zMoney(m.badAmount, { min: 1 }),
    category: zText(60),
    description: zReqText(300, m.descriptionRequired, d.common.tooLong),
    branchId: zOptId(f.branch),
  }), formToObject(formData), m.badAmount);
  if (!parsed.ok) return { error: parsed.error };
  const { type, amount, category, description, branchId } = parsed.data;

  if (category && !(await FinanceCategory.exists({ name: category, type, active: true }))) return { error: f.badCategory };
  if (branchId && !(await Branch.exists({ _id: branchId, active: true }))) return { error: f.branch };

  try {
    const entry = await CashFlow.create({
      type, amount, description, recordedBy: user.username,
      ...(category ? { category } : {}),
      ...(branchId ? { branchId } : {}),
    });
    await recordAudit(user, {
      action: type === 'income' ? 'finance.income' : 'finance.expense',
      entity: 'finance',
      entityId: String(entry._id),
      summary: `${type === 'income' ? 'Kirim' : 'Chiqim'}${category ? ` (${category})` : ''}: ${fmtSum(amount)} — ${description}`,
      meta: { type, amount, category, branchId },
    });
    revalidatePath('/app/finance');
    revalidatePath('/app/finance/state');
    return { success: f.added };
  } catch {
    return { error: m.saveFailed };
  }
}

export async function createFinanceCategoryAction(_prev: State, formData: FormData): Promise<State> {
  const { user, FinanceCategory, features } = await getTenantAdminSession();
  if (!features.kirimChiqim) return featureDisabledError('kirimChiqim');
  const d = await getDict();
  const f = d.sales.fin;
  const parsed = parseInput(z.object({
    name: zReqText(60, f.catBad, d.common.tooLong),
    type: zOneOf(['income', 'expense'] as const, f.catBad),
  }), formToObject(formData), f.catBad);
  if (!parsed.ok) return { error: parsed.error };
  const { name, type } = parsed.data;
  try {
    await FinanceCategory.create({ name, type, active: true });
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return { error: f.catExists };
    return { error: d.sales.actions.saveFailed };
  }
  await recordAudit(user, { action: 'finance.category', entity: 'finance', summary: `Toifa qo'shildi: ${name} (${type})` });
  revalidatePath('/app/finance/categories');
  revalidatePath('/app/finance');
  return { success: tr(f.catAdded, { name }) };
}

export async function toggleFinanceCategoryAction(formData: FormData): Promise<void> {
  const { FinanceCategory, features } = await getTenantAdminSession();
  if (!features.kirimChiqim) return;
  const id = parseInput(zId('bad'), formData.get('categoryId'));
  if (!id.ok) return;
  // Tizim toifalari (kassa operatsiyalari) o'chirilmaydi
  await FinanceCategory.updateOne({ _id: id.data, system: { $ne: true } }, { $set: { active: formData.get('active') === '1' } });
  revalidatePath('/app/finance/categories');
  revalidatePath('/app/finance');
}
