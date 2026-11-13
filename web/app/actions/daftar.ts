'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTenantSession } from '@/lib/tenantSession';
import { featureDisabledError } from '@/lib/featureAction';
import { checkPermission } from '@/lib/permissionGuard';
import type { LedgerType } from '@/lib/models/tenant/LedgerEntry';
import { normalizePhone, isValidUzPhone } from '@/lib/sms';
import { getDict } from '@/lib/i18n/server';
import { z } from 'zod';
import { formToObject, parseInput, zDate, zId, zMoney, zOptId, zReqText, zText, zField } from '@/lib/validation';
import { addLedgerPayment, createLedgerEntry, deleteLedgerEntry } from '@/lib/daftarOps';

type State = { error?: string; success?: string } | null;

/** «Kassaga qo'shilsinmi?» javobi — kassa moduli yoqilgan bo'lsa majburiy (oldindan tanlanmaydi) */
const zKassaAnswer = zField((v) => (v === 'yes' ? 'yes' : v === 'no' ? 'no' : ''));

/** Kassa sahifalari ham yangilansin (smena, hisoblar holati, kirim-chiqim) */
function revalidateDaftar() {
  revalidatePath('/app/daftar');
  revalidatePath('/app/customers', 'layout');
  revalidatePath('/app/kassa', 'layout');
  revalidatePath('/app/shifts');
  revalidatePath('/app/finance', 'layout');
  revalidatePath('/app');
}

export async function createDaftarAction(_prev: State, formData: FormData): Promise<State> {
  const tenant = await getTenantSession();
  const { user, features } = tenant;
  if (!features.daftar) return featureDisabledError('daftar');
  { const denied = await checkPermission(user, 'daftar.manage'); if (denied) return denied; }
  const d = await getDict();
  const m = d.sales.actions;
  const k = d.sales.daftar;

  const parsed = parseInput(z.object({
    type: zField((v): LedgerType => (v === 'taken' ? 'taken' : 'given')),
    personName: zReqText(80, m.nameRequired, m.nameTooLong80),
    personPhone: zReqText(40, m.phoneRequired, m.badPhone),
    amount: zMoney(m.badAmount, { min: 1 }),
    dueDate: zDate(m.badDate, { requiredMessage: m.dueRequired }),
    note: zText(300, m.noteTooLong300),
    toKassa: zKassaAnswer,
    kassaBranchId: zOptId(k.kassaPickBranch),
  }), formToObject(formData), m.badAmount);
  if (!parsed.ok) return { error: parsed.error };
  const { type, personName, amount, dueDate, note, toKassa, kassaBranchId } = parsed.data;
  // Bu raqamga cron SMS yuboradi — faqat O'zbekiston mobil raqami (998 + 9 raqam) qabul qilinadi
  const personPhone = normalizePhone(parsed.data.personPhone);
  if (!isValidUzPhone(personPhone)) return { error: m.badPhone };
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  if (dueDate < todayStart) return { error: m.duePast };
  if (features.kassa && !toKassa) return { error: k.kassaRequired };

  const r = await createLedgerEntry(user, tenant, k, {
    type, personName, personPhone, amount, dueDate, note: note || undefined,
    toKassa: features.kassa && toKassa === 'yes',
    kassaBranchId,
  });
  if (!r.ok) return { error: r.error };
  revalidateDaftar();
  redirect('/app/daftar?created=1');
}

/** Qaytarish (to'liq yoki qisman) — kassaga tushdimi, har safar so'raladi */
export async function payDaftarAction(_prev: State, formData: FormData): Promise<State> {
  const tenant = await getTenantSession();
  const { user, features } = tenant;
  if (!features.daftar) return featureDisabledError('daftar');
  { const denied = await checkPermission(user, 'daftar.manage'); if (denied) return denied; }
  const k = (await getDict()).sales.daftar;

  const parsed = parseInput(z.object({
    id: zId(k.notFound),
    amount: zMoney(k.payBad, { min: 1 }),
    toKassa: zKassaAnswer,
    kassaBranchId: zOptId(k.kassaPickBranch),
  }), formToObject(formData), k.payBad);
  if (!parsed.ok) return { error: parsed.error };
  const { id, amount, toKassa, kassaBranchId } = parsed.data;
  if (features.kassa && !toKassa) return { error: k.kassaRequired };

  const r = await addLedgerPayment(user, tenant, k, {
    id, amount, toKassa: features.kassa && toKassa === 'yes', kassaBranchId,
  });
  if (!r.ok) return { error: r.error };
  revalidateDaftar();
  return { success: k.paySubmit };
}

export async function deleteDaftarAction(formData: FormData): Promise<void> {
  const tenant = await getTenantSession();
  const { features, user } = tenant;
  if (!features.daftar || (await checkPermission(user, 'daftar.delete'))) return;
  const k = (await getDict()).sales.daftar;
  const parsed = parseInput(zId('bad'), formData.get('id'));
  if (!parsed.ok) return;
  await deleteLedgerEntry(user, tenant, k, { id: parsed.data });
  revalidateDaftar();
}
