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
      planTier: 'free',
      mustChangePassword: false,
      referredBy,
    });

    const { Organization } = await getMasterModels();
    const org = await Organization.findById(orgId).lean();
    if (!org) return { error: 'Do\'kon yaratildi, lekin kirishda xatolik.' };

    const { User } = await getTenantModels(org.dbName);
    const tenantUser = await User.findOne({ username: adminUsername, role: 'admin' }).exec();
    if (!tenantUser) return { error: 'Admin yaratildi, lekin avtomatik kirish muvaffaqiyatsiz.' };

    const session = await getSession();
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
    redirect('/app?welcome=1');
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    return { error: err instanceof Error ? err.message : 'Xatolik yuz berdi.' };
  }
}
