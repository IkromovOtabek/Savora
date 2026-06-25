'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireSuperAdmin } from '@/lib/auth';
import {
  createOrganization,
  normalizeSlug,
} from '@/lib/organizations';
import { parsePlanTier } from '@/lib/plans';
import { parseBusinessType } from '@/lib/businessTypes';

type State = { error?: string; success?: string } | null;

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

export async function createOrganizationAction(_prev: State, formData: FormData): Promise<State> {
  await requireSuperAdmin();

  const name = String(formData.get('name') || '');
  const slug = normalizeSlug(String(formData.get('slug') || ''));
  const ownerName = String(formData.get('ownerName') || '');
  const phone = String(formData.get('phone') || '');
  const adminUsername = String(formData.get('adminUsername') || '');
  const adminPassword = String(formData.get('adminPassword') || '');
  const businessType = parseBusinessType(String(formData.get('businessType') || 'general'));
  const trialDaysRaw = Number(formData.get('trialDays') || 30);
  const trialDays = Number.isFinite(trialDaysRaw) && trialDaysRaw > 0 ? Math.floor(trialDaysRaw) : 30;
  const plan = parsePlanFields(formData);

  try {
    const { orgId } = await createOrganization({
      name,
      slug,
      ownerName,
      phone,
      adminUsername,
      adminPassword,
      businessType,
      trialDays,
      planTier: plan.planTier,
      maxFilial: plan.maxFilial,
      maxUsers: plan.maxUsers,
      monthlyPayment: plan.monthlyPayment,
      ...(plan.planTier === 'custom' ? { agreementNote: plan.agreementNote } : {}),
    });
    revalidatePath('/super');
    redirect(`/super/organizations/${orgId}?created=1`);
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    return { error: err instanceof Error ? err.message : 'Xatolik yuz berdi.' };
  }
}
