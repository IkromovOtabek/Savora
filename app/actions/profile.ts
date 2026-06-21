'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { getTenantSession } from '@/lib/tenantSession';
import { markOnboardingStep } from '@/lib/onboarding';

type State = { error?: string; success?: string } | null;

export async function changePasswordAction(_prev: State, formData: FormData): Promise<State> {
  const { user, User } = await getTenantSession();
  const current = String(formData.get('currentPassword') || '');
  const next = String(formData.get('newPassword') || '');
  const confirm = String(formData.get('confirmPassword') || '');

  const dbUser = await User.findById(user.id);
  if (!dbUser) return { error: 'Foydalanuvchi topilmadi.' };

  const mustChange = Boolean(dbUser.mustChangePassword);

  if (!mustChange) {
    if (!current || !(await dbUser.comparePassword(current))) {
      return { error: 'Joriy parol noto\'g\'ri.' };
    }
  }

  if (!next) return { error: 'Yangi parol kiritilishi shart.' };
  if (next.length < 6) return { error: 'Yangi parol kamida 6 ta belgi.' };
  if (next !== confirm) return { error: 'Parollar mos kelmadi.' };

  dbUser.password = next;
  dbUser.mustChangePassword = false;
  dbUser.tokenVersion = (dbUser.tokenVersion ?? 0) + 1;
  await dbUser.save();

  const session = await getSession('tenant');
  if (session.user) {
    session.user.tokenVersion = dbUser.tokenVersion;
    await session.save();
  }

  return { success: 'Parol yangilandi.' };
}

export async function updateProfileAction(_prev: State, formData: FormData): Promise<State> {
  const { user, User } = await getTenantSession();
  const fullName = String(formData.get('fullName') || '').trim();

  const dbUser = await User.findById(user.id);
  if (!dbUser) return { error: 'Foydalanuvchi topilmadi.' };

  dbUser.fullName = fullName || undefined;
  await dbUser.save();
  if (fullName) await markOnboardingStep(user.organizationId, 'profileCompleted');
  revalidatePath('/app/profile');
  return { success: 'Profil yangilandi.' };
}
