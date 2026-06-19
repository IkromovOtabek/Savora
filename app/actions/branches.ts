'use server';

import { revalidatePath } from 'next/cache';
import { getOrgWithPlan, getTenantAdminSession } from '@/lib/tenantSession';

type State = { error?: string; success?: string } | null;

export async function createBranchAction(_prev: State, formData: FormData): Promise<State> {
  const { user, org, Branch } = await getTenantAdminSession();
  if (!org) return { error: 'Do\'kon topilmadi.' };

  const fullOrg = await getOrgWithPlan(user.organizationId!);
  const maxFilial = fullOrg?.plan.maxFilial ?? 1;
  const currentCount = await Branch.countDocuments({ active: true });
  if (currentCount >= maxFilial) {
    return { error: `Tarif bo'yicha maksimum ${maxFilial} ta filial qo'shish mumkin.` };
  }

  const name = String(formData.get('name') || '').trim();
  const address = String(formData.get('address') || '').trim();
  const phone = String(formData.get('phone') || '').trim();
  if (!name) return { error: 'Filial nomi kiritilishi shart.' };

  try {
    await Branch.create({ name, address: address || undefined, phone: phone || undefined, active: true });
    revalidatePath('/app');
    revalidatePath('/app/users');
    revalidatePath('/app/products');
    return { success: 'Filial qo\'shildi.' };
  } catch {
    return { error: 'Filial yaratishda xatolik.' };
  }
}

export async function updateBranchAction(_prev: State, formData: FormData): Promise<State> {
  const { Branch } = await getTenantAdminSession();

  const branchId = String(formData.get('branchId') || '');
  const name = String(formData.get('name') || '').trim();
  const address = String(formData.get('address') || '').trim();
  const phone = String(formData.get('phone') || '').trim();
  const active = formData.get('active') === 'on';

  if (!branchId || !name) return { error: 'Filial nomi kiritilishi shart.' };

  const branch = await Branch.findById(branchId);
  if (!branch) return { error: 'Filial topilmadi.' };

  branch.name = name;
  branch.address = address || undefined;
  branch.phone = phone || undefined;
  branch.active = active;
  await branch.save();

  revalidatePath('/app/users');
  revalidatePath('/app/products');
  return { success: 'Filial yangilandi.' };
}
