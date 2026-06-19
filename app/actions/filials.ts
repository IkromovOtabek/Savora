'use server';

import { revalidatePath } from 'next/cache';
import { getOrgWithPlan, getTenantAdminSession } from '@/lib/tenantSession';
import { markOnboardingStep } from '@/lib/onboarding';
import { recordAudit } from '@/lib/audit';

type State = { error?: string; success?: string } | null;

function normalizeLogin(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, '');
}

/** Filial yaratish — filial + uning login/paroli birga yaratiladi */
export async function createFilialAction(_prev: State, formData: FormData): Promise<State> {
  const { user, User, Branch } = await getTenantAdminSession();

  const fullOrg = user.organizationId ? await getOrgWithPlan(user.organizationId) : null;
  const maxFilial = fullOrg?.plan.maxFilial ?? 1;
  const activeCount = await Branch.countDocuments({ active: true });
  if (activeCount >= maxFilial) {
    return { error: `Tarif bo'yicha maksimum ${maxFilial} ta filial.` };
  }

  const name = String(formData.get('name') || '').trim();
  const address = String(formData.get('address') || '').trim();
  const phone = String(formData.get('phone') || '').trim();
  const username = normalizeLogin(String(formData.get('username') || ''));
  const password = String(formData.get('password') || '');

  if (!name) return { error: 'Filial nomi kiritilishi shart.' };
  if (username.length < 3) return { error: 'Login kamida 3 ta belgidan iborat bo\'lishi kerak.' };
  if (password.length < 6) return { error: 'Parol kamida 6 ta belgidan iborat bo\'lishi kerak.' };

  const dup = await User.findOne({ username }).lean();
  if (dup) return { error: 'Bu login allaqachon band.' };

  try {
    const branch = await Branch.create({ name, address: address || undefined, phone: phone || undefined, active: true });
    const u = new User({
      username,
      password,
      role: 'user',
      fullName: name,
      branchId: branch._id,
      active: true,
      mustChangePassword: false,
    });
    await u.save();
    revalidatePath('/app');
    revalidatePath('/app/profile');
    revalidatePath('/app/products');
    return { success: `${name} filiali yaratildi. Login: ${username}` };
  } catch {
    return { error: 'Filial yaratishda xatolik.' };
  }
}

/** Filial yangilash — filial + login (parol, holat) */
export async function updateFilialAction(_prev: State, formData: FormData): Promise<State> {
  const { User, Branch } = await getTenantAdminSession();

  const branchId = String(formData.get('branchId') || '');
  const name = String(formData.get('name') || '').trim();
  const address = String(formData.get('address') || '').trim();
  const phone = String(formData.get('phone') || '').trim();
  const active = formData.get('active') === 'on';
  const newPassword = String(formData.get('newPassword') || '');

  if (!branchId || !name) return { error: 'Filial nomi kiritilishi shart.' };

  const branch = await Branch.findById(branchId);
  if (!branch) return { error: 'Filial topilmadi.' };

  branch.name = name;
  branch.address = address || undefined;
  branch.phone = phone || undefined;
  branch.active = active;
  await branch.save();

  // Bog'langan login
  const u = await User.findOne({ branchId });
  if (u) {
    u.fullName = name;
    u.active = active;
    if (newPassword && newPassword.length >= 6) {
      u.password = newPassword;
      u.tokenVersion = (u.tokenVersion ?? 0) + 1;
      u.mustChangePassword = false;
    } else if (newPassword && newPassword.length < 6) {
      return { error: 'Yangi parol kamida 6 ta belgidan iborat bo\'lishi kerak.' };
    }
    await u.save();
  }

  revalidatePath('/app');
  revalidatePath('/app/profile');
  revalidatePath('/app/products');
  return { success: 'Filial saqlandi.' };
}
