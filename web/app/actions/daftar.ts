'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTenantSession } from '@/lib/tenantSession';
import { featureDisabledError } from '@/lib/featureAction';
import { branchFilter } from '@/lib/branchScope';
import { checkPermission, userCan } from '@/lib/permissionGuard';
import type { LedgerType } from '@/lib/models/tenant/LedgerEntry';

type State = { error?: string; success?: string } | null;

export async function createDaftarAction(_prev: State, formData: FormData): Promise<State> {
  const { user, features, LedgerEntry } = await getTenantSession();
  if (!features.daftar) return featureDisabledError('daftar');
  { const denied = await checkPermission(user, 'daftar.manage'); if (denied) return denied; }

  const type = (String(formData.get('type') || 'given') === 'taken' ? 'taken' : 'given') as LedgerType;
  const personName = String(formData.get('personName') || '').trim();
  const personPhone = String(formData.get('personPhone') || '').trim();
  const amount = Number(String(formData.get('amount') || '').replace(/\D/g, ''));
  const dueDateRaw = String(formData.get('dueDate') || '');
  const note = String(formData.get('note') || '').trim();

  if (!personName) return { error: 'Ism kiritilishi shart.' };
  if (!personPhone) return { error: 'Telefon raqami shart.' };
  if (!amount || amount <= 0) return { error: "Summa noto'g'ri." };
  if (!dueDateRaw) return { error: 'Qaytarish kuni tanlanishi shart.' };
  const dueDate = new Date(dueDateRaw);
  if (isNaN(dueDate.getTime())) return { error: "Sana noto'g'ri." };

  try {
    await LedgerEntry.create({
      type,
      personName,
      personPhone,
      amount,
      dueDate,
      note: note || undefined,
      status: 'open',
      branchId: user.branchId || undefined,
      createdBy: user.username,
      createdByUserId: user.id,
    });
    revalidatePath('/app/daftar');
    redirect('/app/daftar?created=1');
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    return { error: 'Saqlashda xatolik.' };
  }
}

export async function returnDaftarAction(formData: FormData): Promise<void> {
  const { features, LedgerEntry, user } = await getTenantSession();
  if (!features.daftar || !(await userCan(user, 'daftar.manage'))) return;
  const id = String(formData.get('id') || '');
  if (!id) return;
  await LedgerEntry.findOneAndUpdate(
    { _id: id, ...branchFilter(user) },
    { $set: { status: 'returned', returnedAt: new Date() } }
  );
  revalidatePath('/app/daftar');
}

export async function deleteDaftarAction(formData: FormData): Promise<void> {
  const { features, LedgerEntry, user } = await getTenantSession();
  if (!features.daftar || !(await userCan(user, 'daftar.manage'))) return;
  const id = String(formData.get('id') || '');
  if (!id) return;
  await LedgerEntry.deleteOne({ _id: id, ...branchFilter(user) });
  revalidatePath('/app/daftar');
}
