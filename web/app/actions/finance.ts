'use server';

import { revalidatePath } from 'next/cache';
import { getTenantAdminSession } from '@/lib/tenantSession';
import { recordAudit } from '@/lib/audit';
import { featureDisabledError } from '@/lib/featureAction';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';

type State = { error?: string; success?: string } | null;

function parseAmount(v: string): number | null {
  const n = Number(v.replace(/\s/g, ''));
  // Butun so'm — kasr summalar rad etiladi
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

function fmtSum(n: number): string {
  return new Intl.NumberFormat('uz-UZ').format(n) + ' so\'m';
}

export async function createCreditBankAction(_prev: State, formData: FormData): Promise<State> {
  const { CreditBank, features } = await getTenantAdminSession();
  if (!features.creditKassa) return featureDisabledError('creditKassa');
  const m = (await getDict()).sales.actions;
  const name = String(formData.get('name') || '').trim();
  if (!name) return { error: m.bankNameRequired };

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
  const bankId = String(formData.get('bankId') || '');
  const active = formData.get('active') === '1';
  if (!bankId) return;

  await CreditBank.findByIdAndUpdate(bankId, { active });
  revalidatePath('/app/kredit-kassa');
}

export async function deleteCreditBankAction(formData: FormData): Promise<void> {
  const { CreditBank, features } = await getTenantAdminSession();
  if (!features.creditKassa) return;
  const bankId = String(formData.get('bankId') || '');
  if (!bankId) return;

  await CreditBank.findByIdAndDelete(bankId);
  revalidatePath('/app/kredit-kassa');
}

export async function createCashFlowAction(_prev: State, formData: FormData): Promise<State> {
  const { user, CashFlow, features } = await getTenantAdminSession();
  if (!features.kirimChiqim) return featureDisabledError('kirimChiqim');
  const m = (await getDict()).sales.actions;
  const type = String(formData.get('type') || '') as 'income' | 'expense';
  const description = String(formData.get('description') || '').trim();
  const amount = parseAmount(String(formData.get('amount') || ''));

  if (type !== 'income' && type !== 'expense') return { error: m.badType };
  if (!description) return { error: m.descriptionRequired };
  if (amount === null) return { error: m.badAmount };

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
  const entryId = String(formData.get('entryId') || '');
  if (!entryId) return;

  const deleted = await CashFlow.findByIdAndDelete(entryId).lean();
  await recordAudit(user, {
    action: 'finance.delete',
    entity: 'finance',
    entityId: entryId,
    summary: deleted
      ? `${deleted.type === 'income' ? 'Kirim' : 'Chiqim'} o'chirildi: ${fmtSum(deleted.amount)} — ${deleted.description}`
      : `Kirim/chiqim o'chirildi: ${entryId}`,
  });
  revalidatePath('/app/kirim-chiqim');
}
