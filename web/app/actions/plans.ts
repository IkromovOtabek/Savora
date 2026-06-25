'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/auth';
import { savePlatformPlanOverrides } from '@/lib/platformSettings';
import { PlanTier } from '@/lib/plans';

type State = { error?: string; success?: string } | null;

function parseTierField(formData: FormData, tier: Exclude<PlanTier, 'custom'>, field: string): number | undefined {
  const raw = String(formData.get(`${tier}_${field}`) || '').trim();
  if (!raw) return undefined;
  const n = Number(raw.replace(/\s/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

export async function updatePlatformPlansAction(_prev: State, formData: FormData): Promise<State> {
  await requireSuperAdmin();

  const overrides: Parameters<typeof savePlatformPlanOverrides>[0] = {};

  for (const tier of ['starter', 'pro', 'business'] as const) {
    const maxFilial = parseTierField(formData, tier, 'maxFilial');
    const maxUsers = parseTierField(formData, tier, 'maxUsers');
    const monthlyPrice = parseTierField(formData, tier, 'monthlyPrice');
    const label = String(formData.get(`${tier}_label`) || '').trim();
    const description = String(formData.get(`${tier}_description`) || '').trim();

    if (maxFilial !== undefined || maxUsers !== undefined || monthlyPrice !== undefined || label || description) {
      overrides[tier] = {
        ...(maxFilial !== undefined ? { maxFilial } : {}),
        ...(maxUsers !== undefined ? { maxUsers } : {}),
        ...(monthlyPrice !== undefined ? { monthlyPrice } : {}),
        ...(label ? { label } : {}),
        ...(description ? { description } : {}),
      };
    }
  }

  try {
    await savePlatformPlanOverrides(overrides);
    revalidatePath('/super/plans');
    revalidatePath('/');
    revalidatePath('/super');
    return { success: 'Tariflar saqlandi. Marketing sahifasi yangilandi.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Xatolik yuz berdi.' };
  }
}
