'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { requireSuperAdmin } from '@/lib/auth';
import {
  createOrganization,
  normalizeSlug,
  resetOrgAdminPassword,
} from '@/lib/organizations';
import { tenantLoginUrl } from '@/lib/urls';
import { recordSecurityEvent } from '@/lib/securityEvents';
import { clientIpFrom } from '@/lib/security';
import { parsePlanTier } from '@/lib/plans';
import { parseBusinessType } from '@/lib/businessTypes';
import { getDict } from '@/lib/i18n/server';

/** Yangi do'kon kirish ma'lumotlari — parol faqat shu javobda bir marta ko'rsatiladi */
export interface CreatedOrgCredentials {
  orgId: string;
  username: string;
  password: string;
  loginUrl: string;
}

type State = { error?: string; created?: CreatedOrgCredentials } | null;

function parseIntField(v: string, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function parsePlanFields(formData: FormData) {
  const planTier = parsePlanTier(String(formData.get('planTier') || 'pro'));
  return {
    planTier,
    maxFilial: parseIntField(String(formData.get('maxFilial') || ''), 1),
    maxUsers: parseIntField(String(formData.get('maxUsers') || ''), 3),
    monthlyPayment: parseIntField(String(formData.get('monthlyPayment') || ''), 0),
    agreementNote: String(formData.get('agreementNote') || '').trim(),
  };
}

export async function createOrganizationAction(_prev: State, formData: FormData): Promise<State> {
  await requireSuperAdmin();

  const name = String(formData.get('name') || '');
  const slug = normalizeSlug(String(formData.get('slug') || ''));
  const ownerName = String(formData.get('ownerName') || '');
  const phone = String(formData.get('phone') || '');
  const adminUsername = String(formData.get('adminUsername') || '');
  const adminPassword = String(formData.get('adminPassword') || '');
  const businessType = parseBusinessType(String(formData.get('businessType') || 'general'));
  const trialDaysRaw = Number(formData.get('trialDays') || 30);
  const trialDays = Number.isFinite(trialDaysRaw) && trialDaysRaw > 0 ? Math.floor(trialDaysRaw) : 30;
  const plan = parsePlanFields(formData);

  try {
    const { orgId, slug: finalSlug, adminUsername: username, tempPassword } = await createOrganization({
      name,
      slug,
      ownerName,
      phone,
      adminUsername,
      adminPassword,
      businessType,
      trialDays,
      planTier: plan.planTier,
      maxFilial: plan.maxFilial,
      maxUsers: plan.maxUsers,
      monthlyPayment: plan.monthlyPayment,
      ...(plan.planTier === 'custom' ? { agreementNote: plan.agreementNote } : {}),
    });
    revalidatePath('/super');
    // Redirect qilinmaydi: avtomatik yaratilgan parol bazada faqat xesh — uni egasiga
    // berish uchun shu yerda bir marta ko'rsatamiz (URL/cookie'ga yozilmaydi).
    return {
      created: {
        orgId,
        username,
        password: tempPassword ?? adminPassword,
        loginUrl: tenantLoginUrl(finalSlug),
      },
    };
  } catch (err) {
    const d = await getDict();
    return { error: err instanceof Error ? err.message : d.common.errorGeneric };
  }
}

/**
 * Super Admin — do'kon adminiga yangi vaqtinchalik parol (eski parol va sessiyalar
 * bekor bo'ladi). Parol javobda bir marta qaytariladi, hech qayerda saqlanmaydi.
 */
export async function resetOrgAdminPasswordAction(
  orgId: string,
): Promise<{ error?: string; username?: string; password?: string }> {
  const admin = await requireSuperAdmin();
  const d = await getDict();
  if (typeof orgId !== 'string' || !/^[a-f0-9]{24}$/i.test(orgId)) {
    return { error: d.superPanel.orgEdit.resetFailed };
  }
  try {
    const { username, password, slug } = await resetOrgAdminPassword(orgId);
    const h = await headers();
    recordSecurityEvent('reset_done', {
      username,
      ip: clientIpFrom(h),
      userAgent: h.get('user-agent') ?? undefined,
      zone: 'super',
      slug,
      note: `Super admin (${admin.username}) vaqtinchalik parol berdi`,
    });
    return { username, password };
  } catch (err) {
    return { error: err instanceof Error ? err.message : d.superPanel.orgEdit.resetFailed };
  }
}
