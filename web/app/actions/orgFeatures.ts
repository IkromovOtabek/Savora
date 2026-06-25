'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/auth';
import { updateOrganization } from '@/lib/orgUpdate';
import { parseFeaturesFromForm } from '@/lib/featuresForm';

type State = { error?: string; success?: string } | null;

export async function updateOrgFeaturesAction(_prev: State, formData: FormData): Promise<State> {
  await requireSuperAdmin();

  const orgId = String(formData.get('orgId') || '');
  if (!orgId) return { error: 'Do\'kon ID topilmadi.' };

  const features = parseFeaturesFromForm(formData);

  try {
    await updateOrganization(orgId, { features });
    revalidatePath('/super');
    revalidatePath(`/super/organizations/${orgId}`);
    return { success: 'Modullar saqlandi.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Xatolik yuz berdi.' };
  }
}
