'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/auth';
import { updateOrganization, type OrgStatus } from '@/lib/orgUpdate';
import { parsePlanTier } from '@/lib/plans';
import { parseBusinessType } from '@/lib/businessTypes';

type State = { error?: string; success?: string } | null;

function parseStatus(v: string): OrgStatus {
  if (v === 'active' || v === 'suspended' || v === 'expired') return v;
  return 'active';
}

function parseIntField(v: string, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function parsePlanFields(formData: FormData) {
  const planTier = parsePlanTier(String(formData.get('planTier') || 'pro'));
  return {
    planTier,
    maxFilial: parseIntField(String(formData.get('maxFilial') || ''), 1),
    maxUsers: parseIntField(String(formData.get('maxUsers') || ''), 3),
    monthlyPayment: parseIntField(String(formData.get('monthlyPayment') || ''), 0),
    agreementNote: String(formData.get('agreementNote') || '').trim(),
  };
}

export async function updateOrganizationAction(_prev: State, formData: FormData): Promise<State> {
  await requireSuperAdmin();

  const orgId = String(formData.get('orgId') || '');
  if (!orgId) return { error: 'Do\'kon ID topilmadi.' };

  const name = String(formData.get('name') || '');
  const ownerName = String(formData.get('ownerName') || '');
  const phone = String(formData.get('phone') || '');
  const status = parseStatus(String(formData.get('status') || 'active'));
  const businessType = parseBusinessType(String(formData.get('businessType') || 'general'));
  const expiresRaw = String(formData.get('expiresAt') || '');
  const plan = parsePlanFields(formData);

  let expiresAt: Date;
  try {
    expiresAt = new Date(expiresRaw);
    if (Number.isNaN(expiresAt.getTime())) throw new Error();
  } catch {
    return { error: 'Muddat sanasi noto\'g\'ri.' };
  }

  try {
    await updateOrganization(orgId, {
      name,
      ownerName,
      phone,
      status,
      expiresAt,
      businessType,
      planTier: plan.planTier,
      maxFilial: plan.maxFilial,
      maxUsers: plan.maxUsers,
      monthlyPayment: plan.monthlyPayment,
      ...(plan.planTier === 'custom' ? { agreementNote: plan.agreementNote } : {}),
    });
    revalidatePath('/super');
    revalidatePath(`/super/organizations/${orgId}`);
    return { success: 'O\'zgarishlar saqlandi.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Xatolik yuz berdi.' };
  }
}
