'use server';

import { revalidatePath } from 'next/cache';
import { getOrgWithPlan, getTenantAdminSession } from '@/lib/tenantSession';
import { generateTempPassword, loginFromFullName } from '@/lib/credentials';

type State = {
  error?: string;
  success?: string;
  generatedLogin?: string;
  tempPassword?: string;
} | null;

export async function createEmployeeAction(_prev: State, formData: FormData): Promise<State> {
  const { user, User } = await getTenantAdminSession();
  const fullOrg = user.organizationId ? await getOrgWithPlan(user.organizationId) : null;
  const maxUsers = fullOrg?.plan.maxUsers ?? 3;
  const activeCount = await User.countDocuments({ active: true });
  if (activeCount >= maxUsers) {
    return { error: `Tarif bo'yicha maksimum ${maxUsers} ta xodim.` };
  }

  const fullName = String(formData.get('fullName') || '').trim();
  const role = String(formData.get('role') || 'user') === 'admin' ? 'admin' : 'user';

  if (!fullName) return { error: 'To\'liq ism kiritilishi shart.' };

  let username = loginFromFullName(fullName);
  for (let i = 0; i < 5; i++) {
    const exists = await User.findOne({ username }).lean();
    if (!exists) break;
    username = loginFromFullName(fullName);
  }

  const tempPassword = generateTempPassword();

  try {
    const emp = new User({
      username,
      password: tempPassword,
      role,
      fullName,
      active: true,
      mustChangePassword: true,
    });
    await emp.save();
    revalidatePath('/app/users');
    return {
      success: `${fullName} qo'shildi. Login va vaqtinchalik parolni xodimga bering — u profildan o'zgartiradi.`,
      generatedLogin: username,
      tempPassword,
    };
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    return { error: 'Xodim yaratishda xatolik.' };
  }
}

export async function updateEmployeeAction(_prev: State, formData: FormData): Promise<State> {
  const { user, User } = await getTenantAdminSession();
  const userId = String(formData.get('userId') || '');
  const fullName = String(formData.get('fullName') || '').trim();
  const role = String(formData.get('role') || 'user') === 'admin' ? 'admin' : 'user';
  const active = formData.get('active') === 'on';
  const newPassword = String(formData.get('newPassword') || '');

  if (!userId) return { error: 'Xodim topilmadi.' };
  if (userId === user.id && !active) return { error: 'O\'zingizni nofaol qila olmaysiz.' };

  const emp = await User.findById(userId);
  if (!emp) return { error: 'Xodim topilmadi.' };

  emp.fullName = fullName || undefined;
  emp.role = role;
  emp.active = active;
  if (newPassword.length >= 6) {
    emp.password = newPassword;
    emp.tokenVersion = (emp.tokenVersion ?? 0) + 1;
    emp.mustChangePassword = false;
  }
  await emp.save();

  revalidatePath('/app/users');
  revalidatePath(`/app/users/${userId}`);
  return { success: 'Saqlandi.' };
}
