'use server';

import { isValidObjectId } from 'mongoose';
import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/auth';
import { updateOrganization } from '@/lib/orgUpdate';
import { parseFeaturesFromForm } from '@/lib/featuresForm';
import { diffFeatureOverrides } from '@/lib/features';
import { getMasterModels } from '@/lib/masterDb';
import { BUSINESS_TYPES, parseBusinessType } from '@/lib/businessTypes';

type State = { error?: string; success?: string } | null;

export async function updateOrgFeaturesAction(_prev: State, formData: FormData): Promise<State> {
  // Faqat platforma egasi modullarni o'zgartira oladi.
  await requireSuperAdmin();

  const orgId = String(formData.get('orgId') || '');
  if (!orgId || !isValidObjectId(orgId)) return { error: 'Do\'kon ID noto\'g\'ri.' };

  // parseFeaturesFromForm faqat FEATURE_KEYS bo'yicha o'qiydi — begona kalit inject bo'lmaydi.
  const wanted = parseFeaturesFromForm(formData);

  try {
    const { Organization } = await getMasterModels();
    const org = await Organization.findById(orgId).select('plan businessType').lean();
    if (!org) return { error: 'Do\'kon topilmadi.' };
    // Faqat tarif + biznes presetidan FARQ qiladigan modullar override sifatida saqlanadi —
    // qolganlari keyin ham preset/tarif o'zgarishiga ergashadi.
    const overrides = diffFeatureOverrides(org, wanted);
    await updateOrganization(orgId, { features: Object.keys(overrides).length ? overrides : null });
    revalidatePath('/super');
    revalidatePath(`/super/organizations/${orgId}`);
    return { success: 'Modullar saqlandi.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Xatolik yuz berdi.' };
  }
}

/** Biznes turini o'rnatadi va modullarni shu turning presetiga qaytaradi (override'lar tozalanadi) */
export async function applyBusinessPresetAction(_prev: State, formData: FormData): Promise<State> {
  await requireSuperAdmin();

  const orgId = String(formData.get('orgId') || '');
  if (!orgId || !isValidObjectId(orgId)) return { error: 'Do\'kon ID noto\'g\'ri.' };
  const businessType = parseBusinessType(String(formData.get('businessType') || 'general'));

  try {
    await updateOrganization(orgId, { businessType, features: null });
    revalidatePath('/super');
    revalidatePath(`/super/organizations/${orgId}`);
    return { success: `«${BUSINESS_TYPES[businessType].label}» presetiga mos modullar qo'llandi.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Xatolik yuz berdi.' };
  }
}
