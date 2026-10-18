'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getTenantSession } from '@/lib/tenantSession';
import { featureDisabledError } from '@/lib/featureAction';
import { checkPermission } from '@/lib/permissionGuard';
import { openShift, closeShift, shiftCashOp } from '@/lib/cashShiftOps';
import { formToObject, parseInput, zId, zMoney, zOneOf, zText } from '@/lib/validation';
import { getDict } from '@/lib/i18n/server';

type State = { error?: string; success?: string } | null;

export async function openShiftAction(_prev: State, formData: FormData): Promise<State> {
  const session = await getTenantSession();
  const { user, features } = session;
  if (!features.kassa) return featureDisabledError('kassa');
  const denied = await checkPermission(user, 'kassa.shift');
  if (denied) return denied;
  const k = (await getDict()).sales.shifts;

  const parsed = parseInput(z.object({
    branchId: zId(k.badBranch),
    openingCash: zMoney(k.badAmount, { min: 0 }),
  }), formToObject(formData), k.badAmount);
  if (!parsed.ok) return { error: parsed.error };

  const res = await openShift(user, session, k, parsed.data);
  if ('success' in res) revalidatePath('/app/shifts');
  return res;
}

export async function closeShiftAction(_prev: State, formData: FormData): Promise<State> {
  const session = await getTenantSession();
  const { user, features } = session;
  if (!features.kassa) return featureDisabledError('kassa');
  const denied = await checkPermission(user, 'kassa.shift');
  if (denied) return denied;
  const k = (await getDict()).sales.shifts;

  const parsed = parseInput(z.object({
    shiftId: zId(k.notFound),
    countedCash: zMoney(k.badAmount, { min: 0 }),
    note: zText(300),
  }), formToObject(formData), k.badAmount);
  if (!parsed.ok) return { error: parsed.error };

  const res = await closeShift(user, session, k, parsed.data);
  if ('success' in res) revalidatePath('/app/shifts');
  return res;
}

/** Smena ichida kassa operatsiyasi: kassaga pul qo'shish yoki olish (CashFlow + filial + smena) */
export async function shiftCashOpAction(_prev: State, formData: FormData): Promise<State> {
  const session = await getTenantSession();
  const { user, features } = session;
  if (!features.kassa) return featureDisabledError('kassa');
  const denied = await checkPermission(user, 'kassa.shift');
  if (denied) return denied;
  const k = (await getDict()).sales.shifts;

  const parsed = parseInput(z.object({
    shiftId: zId(k.notFound),
    type: zOneOf(['income', 'expense'] as const, k.badAmount),
    amount: zMoney(k.badAmount, { min: 1 }),
    note: zText(300),
  }), formToObject(formData), k.badAmount);
  if (!parsed.ok) return { error: parsed.error };

  const res = await shiftCashOp(user, session, k, parsed.data);
  if ('success' in res) {
    revalidatePath('/app/shifts');
    revalidatePath('/app/finance');
  }
  return res;
}
