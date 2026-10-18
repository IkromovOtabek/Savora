'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTenantSession } from '@/lib/tenantSession';
import { featureDisabledError } from '@/lib/featureAction';
import { branchFilter } from '@/lib/branchScope';
import { checkPermission, userCan } from '@/lib/permissionGuard';
import type { LedgerType } from '@/lib/models/tenant/LedgerEntry';
import { normalizePhone, isValidUzPhone } from '@/lib/sms';
import { getDict } from '@/lib/i18n/server';
import { z } from 'zod';
import { formToObject, parseInput, zDate, zId, zMoney, zReqText, zText, zField } from '@/lib/validation';

type State = { error?: string; success?: string } | null;

export async function createDaftarAction(_prev: State, formData: FormData): Promise<State> {
  const { user, features, LedgerEntry } = await getTenantSession();
  if (!features.daftar) return featureDisabledError('daftar');
  { const denied = await checkPermission(user, 'daftar.manage'); if (denied) return denied; }
  const m = (await getDict()).sales.actions;

  const parsed = parseInput(z.object({
    type: zField((v): LedgerType => (v === 'taken' ? 'taken' : 'given')),
    personName: zReqText(80, m.nameRequired, m.nameTooLong80),
    personPhone: zReqText(40, m.phoneRequired, m.badPhone),
    amount: zMoney(m.badAmount, { min: 1 }),
    dueDate: zDate(m.badDate, { requiredMessage: m.dueRequired }),
    note: zText(300, m.noteTooLong300),
  }), formToObject(formData), m.badAmount);
  if (!parsed.ok) return { error: parsed.error };
  const { type, personName, amount, dueDate, note } = parsed.data;
  // Bu raqamga cron SMS yuboradi — faqat O'zbekiston mobil raqami (998 + 9 raqam) qabul qilinadi
  const personPhone = normalizePhone(parsed.data.personPhone);
  if (!isValidUzPhone(personPhone)) return { error: m.badPhone };
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
  const parsed = parseInput(zId('bad'), formData.get('id'));
  if (!parsed.ok) return;
  await LedgerEntry.findOneAndUpdate(
    { _id: parsed.data, ...branchFilter(user) },
    { $set: { status: 'returned', returnedAt: new Date() } }
  );
  revalidatePath('/app/daftar');
}

export async function deleteDaftarAction(formData: FormData): Promise<void> {
  const { features, LedgerEntry, user } = await getTenantSession();
  if (!features.daftar || !(await userCan(user, 'daftar.manage'))) return;
  const parsed = parseInput(zId('bad'), formData.get('id'));
  if (!parsed.ok) return;
  await LedgerEntry.deleteOne({ _id: parsed.data, ...branchFilter(user) });
  revalidatePath('/app/daftar');
}
