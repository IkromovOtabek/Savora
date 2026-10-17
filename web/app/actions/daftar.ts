'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTenantSession } from '@/lib/tenantSession';
import { featureDisabledError } from '@/lib/featureAction';
import { branchFilter } from '@/lib/branchScope';
import { checkPermission, userCan } from '@/lib/permissionGuard';
import type { LedgerType } from '@/lib/models/tenant/LedgerEntry';
import { parseIntegerSum } from '@/lib/security';
import { normalizePhone, isValidUzPhone } from '@/lib/sms';
import { getDict } from '@/lib/i18n/server';

type State = { error?: string; success?: string } | null;

export async function createDaftarAction(_prev: State, formData: FormData): Promise<State> {
  const { user, features, LedgerEntry } = await getTenantSession();
  if (!features.daftar) return featureDisabledError('daftar');
  { const denied = await checkPermission(user, 'daftar.manage'); if (denied) return denied; }
  const m = (await getDict()).sales.actions;

  const type = (String(formData.get('type') || 'given') === 'taken' ? 'taken' : 'given') as LedgerType;
  const personName = String(formData.get('personName') || '').trim();
  const personPhoneRaw = String(formData.get('personPhone') || '').trim();
  // Bu raqamga cron SMS yuboradi — faqat O'zbekiston mobil raqami (998 + 9 raqam) qabul qilinadi
  const personPhone = personPhoneRaw ? normalizePhone(personPhoneRaw) : '';
  const amount = parseIntegerSum(formData.get('amount')) ?? 0;
  const dueDateRaw = String(formData.get('dueDate') || '');
  const note = String(formData.get('note') || '').trim();

  if (!personName) return { error: m.nameRequired };
  if (personName.length > 80) return { error: m.nameTooLong80 };
  if (note.length > 300) return { error: m.noteTooLong300 };
  if (!personPhone) return { error: m.phoneRequired };
  if (!isValidUzPhone(personPhone)) return { error: m.badPhone };
  if (!amount || amount <= 0) return { error: m.badAmount };
  if (!dueDateRaw) return { error: m.dueRequired };
  const dueDate = new Date(dueDateRaw);
  if (isNaN(dueDate.getTime())) return { error: m.badDate };
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  if (dueDate < todayStart) return { error: m.duePast };

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
    return { error: m.saveFailed };
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
