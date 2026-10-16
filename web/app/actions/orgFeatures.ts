'use server';

import { isValidObjectId } from 'mongoose';
import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/auth';
import { updateOrganization } from '@/lib/orgUpdate';
import { parseFeaturesFromForm } from '@/lib/featuresForm';
import { diffFeatureOverrides } from '@/lib/features';
import { getMasterModels } from '@/lib/masterDb';
import { parseBusinessType } from '@/lib/businessTypes';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';

type State = { error?: string; success?: string } | null;

export async function updateOrgFeaturesAction(_prev: State, formData: FormData): Promise<State> {
  // Faqat platforma egasi modullarni o'zgartira oladi.
  await requireSuperAdmin();
  const d = await getDict();

  const orgId = String(formData.get('orgId') || '');
  if (!orgId || !isValidObjectId(orgId)) return { error: d.superPanel.actions.badOrgId };

  // parseFeaturesFromForm faqat FEATURE_KEYS bo'yicha o'qiydi — begona kalit inject bo'lmaydi.
  const wanted = parseFeaturesFromForm(formData);

  try {
    const { Organization } = await getMasterModels();
    const org = await Organization.findById(orgId).select('plan businessType').lean();
    if (!org) return { error: d.superPanel.actions.orgNotFound };
    // Faqat tarif + biznes presetidan FARQ qiladigan modullar override sifatida saqlanadi —
    // qolganlari keyin ham preset/tarif o'zgarishiga ergashadi.
    const overrides = diffFeatureOverrides(org, wanted);
    await updateOrganization(orgId, { features: Object.keys(overrides).length ? overrides : null });
    revalidatePath('/super');
    revalidatePath(`/super/organizations/${orgId}`);
    return { success: d.superPanel.actions.modulesSaved };
  } catch (err) {
    return { error: err instanceof Error ? err.message : d.common.errorGeneric };
  }
}

/** Biznes turini o'rnatadi va modullarni shu turning presetiga qaytaradi (override'lar tozalanadi) */
export async function applyBusinessPresetAction(_prev: State, formData: FormData): Promise<State> {
  await requireSuperAdmin();
  const d = await getDict();

  const orgId = String(formData.get('orgId') || '');
  if (!orgId || !isValidObjectId(orgId)) return { error: d.superPanel.actions.badOrgId };
  const businessType = parseBusinessType(String(formData.get('businessType') || 'general'));

  try {
    await updateOrganization(orgId, { businessType, features: null });
    revalidatePath('/super');
    revalidatePath(`/super/organizations/${orgId}`);
    return { success: tr(d.superPanel.actions.presetApplied, { label: d.catalog.businessTypes[businessType].label }) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : d.common.errorGeneric };
  }
}
