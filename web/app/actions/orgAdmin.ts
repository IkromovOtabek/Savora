'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isValidObjectId } from 'mongoose';
import { requireSuperAdmin } from '@/lib/auth';
import { getMasterModels } from '@/lib/masterDb';
import { deleteOrganizationPermanently } from '@/lib/orgDelete';
import { changeOrgLogin, LoginChangeError } from '@/lib/orgLogins';
import { recordSecurityEvent } from '@/lib/securityEvents';
import { recordAudit } from '@/lib/audit';
import { clientIpFrom } from '@/lib/security';
import { hitRateLimit } from '@/lib/rateLimit';
import { logError, logWarn } from '@/lib/logger';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';

type DeleteState = { error?: string } | null;

/** Qaytarib bo'lmaydigan amaldan oldin super admin parolini qayta tekshirish (sessiya o'g'irlansa ham bosib bo'lmasin) */
async function verifySuperPassword(username: string, password: string): Promise<boolean> {
  if (!password) return false;
  const { SuperAdmin } = await getMasterModels();
  const sa = await SuperAdmin.findOne({ username }).exec();
  return !!sa && (await sa.comparePassword(password));
}

/**
 * Super Admin — do'konni BUTUNLAY o'chirish. Tasdiqlash: do'kon manzili (slug) qo'lda yoziladi
 * va super admin paroli qayta kiritiladi. Muvaffaqiyatda /super ga qaytaradi.
 */
export async function deleteOrganizationAction(_prev: DeleteState, formData: FormData): Promise<DeleteState> {
  const admin = await requireSuperAdmin();
  const d = await getDict();
  const t = d.superPanel.orgDelete;
  const h = await headers();
  const ip = clientIpFrom(h);

  const orgId = String(formData.get('orgId') || '');
  const confirmSlug = String(formData.get('confirmSlug') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  if (!isValidObjectId(orgId)) return { error: t.notFound };

  const rl = await hitRateLimit(`org-delete:${admin.username}`, 5);
  if (!rl.ok) return { error: tr(t.tooMany, { min: Math.ceil((rl.retryAfterSec ?? 900) / 60) }) };

  const { Organization } = await getMasterModels();
  const org = await Organization.findById(orgId).select('slug name').lean().catch(() => null);
  if (!org) return { error: t.notFound };
  if (confirmSlug !== org.slug) return { error: t.slugMismatch };

  if (!(await verifySuperPassword(admin.username, password))) {
    recordSecurityEvent('super_login_fail', { username: admin.username, ip, userAgent: h.get('user-agent') ?? undefined, zone: 'super', slug: org.slug, note: "Do'konni o'chirishda noto'g'ri parol" });
    return { error: t.wrongPassword };
  }

  try {
    const info = await deleteOrganizationPermanently(orgId);
    recordSecurityEvent('org_deleted', {
      username: admin.username,
      ip,
      userAgent: h.get('user-agent') ?? undefined,
      zone: 'super',
      slug: info.slug,
      note: `${info.name} (${info.dbName}) butunlay o'chirildi`,
    });
    logWarn(`Do'kon o'chirildi: ${info.name} (${info.slug}, ${info.dbName}) — super admin ${admin.username}`);
  } catch (err) {
    logError("Do'konni o'chirishda xato", err, { orgId });
    return { error: err instanceof Error ? err.message : t.failed };
  }

  revalidatePath('/super');
  revalidatePath('/super/dashboard');
  redirect(`/super?deleted=${encodeURIComponent(org.name)}`);
}

export type LoginChangeState = {
  error?: string;
  success?: string;
  username?: string;
  password?: string;
  stamp?: number;
} | null;

/** Super Admin — do'kondagi istalgan login nomi va/yoki parolini o'zgartirish */
export async function changeOrgLoginAction(_prev: LoginChangeState, formData: FormData): Promise<LoginChangeState> {
  const admin = await requireSuperAdmin();
  const d = await getDict();
  const t = d.superPanel.orgLogins;
  const h = await headers();

  const orgId = String(formData.get('orgId') || '');
  const userId = String(formData.get('userId') || '');
  const generate = formData.get('generate') === '1';
  try {
    const res = await changeOrgLogin({
      orgId,
      userId,
      username: String(formData.get('username') || ''),
      password: generate ? '' : String(formData.get('password') || ''),
      generate,
      mustChange: formData.get('mustChange') === 'on',
    });

    const what = [res.loginChanged ? `login: ${res.oldUsername} → ${res.username}` : '', res.passwordChanged ? 'parol yangilandi' : '']
      .filter(Boolean)
      .join(', ');
    recordSecurityEvent('login_changed', {
      username: res.username,
      ip: clientIpFrom(h),
      userAgent: h.get('user-agent') ?? undefined,
      zone: 'super',
      slug: res.slug,
      note: `Super admin (${admin.username}): ${what}`,
    });
    const { Organization } = await getMasterModels();
    const org = await Organization.findById(orgId).select('dbName').lean();
    if (org) {
      await recordAudit(
        { username: `platforma:${admin.username}`, role: 'super_admin', dbName: org.dbName },
        { action: 'user.credentials', entity: 'user', entityId: userId, summary: `Platforma loginni o'zgartirdi — ${what}` },
      );
    }

    revalidatePath(`/super/organizations/${orgId}`);
    return {
      success: res.loginChanged && res.passwordChanged ? t.savedBoth : res.loginChanged ? t.savedLogin : t.savedPassword,
      username: res.username,
      password: res.generatedPassword,
      stamp: Date.now(),
    };
  } catch (err) {
    if (err instanceof LoginChangeError) return { error: err.message };
    logError("Loginni o'zgartirishda xato", err, { orgId, userId });
    return { error: t.failed };
  }
}
