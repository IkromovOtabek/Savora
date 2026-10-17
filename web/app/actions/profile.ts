'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { getTenantSession } from '@/lib/tenantSession';
import { markOnboardingStep } from '@/lib/onboarding';
import { getDict } from '@/lib/i18n/server';

type State = { error?: string; success?: string } | null;

export async function changePasswordAction(_prev: State, formData: FormData): Promise<State> {
  const { user, User } = await getTenantSession();
  const t = (await getDict()).shell.actions;
  const current = String(formData.get('currentPassword') || '');
  const next = String(formData.get('newPassword') || '');
  const confirm = String(formData.get('confirmPassword') || '');

  const dbUser = await User.findById(user.id);
  if (!dbUser) return { error: t.userNotFound };

  const mustChange = Boolean(dbUser.mustChangePassword);

  if (!mustChange) {
    if (!current || !(await dbUser.comparePassword(current))) {
      return { error: t.wrongCurrentPassword };
    }
  }

  if (!next) return { error: t.newPasswordRequired };
  if (next.length < 6) return { error: t.newPasswordShort };
  if (next !== confirm) return { error: t.passwordsMismatch };

  dbUser.password = next;
  dbUser.mustChangePassword = false;
  dbUser.tokenVersion = (dbUser.tokenVersion ?? 0) + 1;
  await dbUser.save();

  const session = await getSession('tenant');
  if (session.user) {
    session.user.tokenVersion = dbUser.tokenVersion;
    await session.save();
  }

  return { success: t.passwordUpdated };
}

export async function updateProfileAction(_prev: State, formData: FormData): Promise<State> {
  const { user, User } = await getTenantSession();
  const t = (await getDict()).shell.actions;
  const fullName = String(formData.get('fullName') || '').trim();

  const dbUser = await User.findById(user.id);
  if (!dbUser) return { error: t.userNotFound };

  dbUser.fullName = fullName || undefined;
  await dbUser.save();
  if (fullName) await markOnboardingStep(user.organizationId, 'profileCompleted');
  revalidatePath('/app/profile');
  return { success: t.profileUpdated };
}
