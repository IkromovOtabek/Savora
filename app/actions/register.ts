'use server';

import { redirect } from 'next/navigation';
import { getAppZone } from '@/lib/tenantContext';
import { createOrganization, normalizeSlug } from '@/lib/organizations';
import { parseBusinessType } from '@/lib/businessTypes';
import { getSession } from '@/lib/session';
import { getMasterModels } from '@/lib/masterDb';
import { getTenantModels } from '@/lib/tenantDb';
import { setRouteCookies } from '@/lib/routeCookies';

type State = { error?: string } | null;

/** Yangi do'kon uchun bepul sinov muddati (kun). .env: TRIAL_DAYS */
const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 14);

export async function registerAction(_prev: State, formData: FormData): Promise<State> {
  const zone = await getAppZone();
  if (zone !== 'root') {
    return { error: 'Ro\'yxatdan o\'tish faqat asosiy saytdan amalga oshiriladi.' };
  }

  const name = String(formData.get('name') || '');
  const slug = normalizeSlug(String(formData.get('slug') || ''));
  const ownerName = String(formData.get('ownerName') || '');
  const phone = String(formData.get('phone') || '');
  const businessType = parseBusinessType(String(formData.get('businessType') || 'general'));
  const adminPassword = String(formData.get('adminPassword') || '');
  const confirmPassword = String(formData.get('confirmPassword') || '');
  const referredBy = String(formData.get('referredBy') || '').trim().toUpperCase() || undefined;

  // 2-qadamda tanlangan tarif. Bepul — doimiy; pulli — 14 kun sinov.
  const rawTier = String(formData.get('planTier') || 'pro');
  const planTier = (['free', 'starter', 'pro', 'business'].includes(rawTier) ? rawTier : 'pro') as
    | 'free' | 'starter' | 'pro' | 'business';
  const isFree = planTier === 'free';

  if (!adminPassword || adminPassword.length < 6) {
    return { error: 'Parol kamida 6 ta belgi.' };
  }
  if (adminPassword !== confirmPassword) {
    return { error: 'Parollar mos kelmadi.' };
  }

  try {
    const { orgId, slug: createdSlug, adminUsername } = await createOrganization({
      name,
      slug,
      ownerName,
      phone,
      businessType,
      adminPassword,
      // Tanlangan tarif — modullar `defaultFeaturesForPlan` orqali avtomatik yoqiladi.
      // Bepul: doimiy; pulli: 14 kun sinov, muddati tugagach to'lov kerak.
      planTier,
      isTrial: !isFree,
      trialDays: isFree ? undefined : TRIAL_DAYS,
      mustChangePassword: false,
      referredBy,
    });

    const { Organization } = await getMasterModels();
    const org = await Organization.findById(orgId).lean();
    if (!org) return { error: 'Do\'kon yaratildi, lekin kirishda xatolik.' };

    const { User } = await getTenantModels(org.dbName);
    const tenantUser = await User.findOne({ username: adminUsername, role: 'admin' }).exec();
    if (!tenantUser) return { error: 'Admin yaratildi, lekin avtomatik kirish muvaffaqiyatsiz.' };

    const session = await getSession('tenant');
    session.user = {
      id: String(tenantUser._id),
      username: tenantUser.username,
      role: 'admin',
      tokenVersion: tenantUser.tokenVersion ?? 0,
      organizationId: String(org._id),
      dbName: org.dbName,
    };
    await session.save();
    await setRouteCookies('tenant', createdSlug);

    const visitorId = String(formData.get('visitorId') || '').trim();
    const visitSessionId = String(formData.get('visitSessionId') || '').trim();
    const { markVisitSignedUp } = await import('@/lib/visitAnalytics');
    await markVisitSignedUp({
      visitorId: visitorId || undefined,
      sessionId: visitSessionId || undefined,
      organizationId: String(org._id),
      organizationSlug: createdSlug,
    });

    redirect('/app?welcome=1');
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    return { error: err instanceof Error ? err.message : 'Xatolik yuz berdi.' };
  }
}
