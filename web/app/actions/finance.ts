'use server';

import { revalidatePath } from 'next/cache';
import { getTenantAdminSession } from '@/lib/tenantSession';
import { recordAudit } from '@/lib/audit';

type State = { error?: string; success?: string } | null;

function parseAmount(v: string): number | null {
  const n = Number(v.replace(/\s/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function fmtSum(n: number): string {
  return new Intl.NumberFormat('uz-UZ').format(n) + ' so\'m';
}

export async function createCreditBankAction(_prev: State, formData: FormData): Promise<State> {
  const { user, CreditBank } = await getTenantAdminSession();
  const name = String(formData.get('name') || '').trim();
  if (!name) return { error: 'Bank nomi kiritilishi shart.' };

  const dup = await CreditBank.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).lean();
  if (dup) return { error: 'Bu bank allaqachon mavjud.' };

  try {
    await CreditBank.create({ name, active: true });
    revalidatePath('/app/kredit-kassa');
    return { success: `"${name}" qo'shildi.` };
  } catch {
    return { error: 'Bank qo\'shishda xatolik.' };
  }
}

export async function toggleCreditBankAction(formData: FormData): Promise<void> {
  const { CreditBank } = await getTenantAdminSession();
  const bankId = String(formData.get('bankId') || '');
  const active = formData.get('active') === '1';
  if (!bankId) return;

  await CreditBank.findByIdAndUpdate(bankId, { active });
  revalidatePath('/app/kredit-kassa');
}

export async function deleteCreditBankAction(formData: FormData): Promise<void> {
  const { CreditBank } = await getTenantAdminSession();
  const bankId = String(formData.get('bankId') || '');
  if (!bankId) return;

  await CreditBank.findByIdAndDelete(bankId);
  revalidatePath('/app/kredit-kassa');
}

export async function createCashFlowAction(_prev: State, formData: FormData): Promise<State> {
  const { user, CashFlow } = await getTenantAdminSession();
  const type = String(formData.get('type') || '') as 'income' | 'expense';
  const description = String(formData.get('description') || '').trim();
  const amount = parseAmount(String(formData.get('amount') || ''));

  if (type !== 'income' && type !== 'expense') return { error: 'Tur noto\'g\'ri.' };
  if (!description) return { error: 'Izoh kiritilishi shart.' };
  if (amount === null) return { error: 'Summa noto\'g\'ri.' };

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
    return { success: type === 'income' ? 'Kirim qo\'shildi.' : 'Chiqim qo\'shildi.' };
  } catch {
    return { error: 'Saqlashda xatolik.' };
  }
}

export async function deleteCashFlowAction(formData: FormData): Promise<void> {
  const { user, CashFlow } = await getTenantAdminSession();
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
