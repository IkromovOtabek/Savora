import { redirect } from 'next/navigation';
import { getSession, SessionUser } from './session';
import { getMasterModels } from './masterDb';
import { getTenantModels } from './tenantDb';
import { IOrganization, isOrganizationActive } from './models/master/Organization';
import { FeatureKey, OrgFeatures, resolveOrgFeatures } from './features';
import { resolveTenant } from './tenantContext';
import { superLoginUrl, tenantLoginUrl } from './urls';

async function verifyTokenVersion(u: SessionUser): Promise<boolean> {
  try {
    if (u.role === 'super_admin') {
      const { SuperAdmin } = await getMasterModels();
      const sa = await SuperAdmin.findById(u.id).select('tokenVersion').lean();
      return !!sa && (sa.tokenVersion ?? 0) === u.tokenVersion;
    }
    if (!u.dbName) return false;
    const { User } = await getTenantModels(u.dbName);
    const user = await User.findById(u.id).select('tokenVersion active').lean();
    return !!user && user.active && (user.tokenVersion ?? 0) === u.tokenVersion;
  } catch {
    return false;
  }
}

/** Sessiya + tokenVersion tekshiruvi (cookie o'zgartirmaydi) */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getSession();
  const u = session.user;
  if (!u) return null;
  if (!(await verifyTokenVersion(u))) return null;
  return u;
}

/** Platforma egasi (super admin) bo'lishini talab qiladi */
export async function requireSuperAdmin(): Promise<SessionUser> {
  const session = await getSession();
  const u = session.user;
  if (!u || u.role !== 'super_admin') redirect(superLoginUrl());
  if (!(await verifyTokenVersion(u))) redirect(superLoginUrl());
  return u;
}

/** Do'kon foydalanuvchisi (admin yoki user) + do'kon faolligini talab qiladi */
export async function requireOrgUser(): Promise<SessionUser> {
  const session = await getSession();
  const u = session.user;
  if (!u || (u.role !== 'admin' && u.role !== 'user') || !u.dbName || !u.organizationId) {
    const org = await resolveTenant();
    redirect(org ? tenantLoginUrl(org.slug) : superLoginUrl());
  }
  if (!(await verifyTokenVersion(u))) {
    const org = await OrganizationById(u.organizationId);
    redirect(org ? tenantLoginUrl(org.slug) : superLoginUrl());
  }
  const org = await OrganizationById(u.organizationId);
  if (!org || !isOrganizationActive(org)) {
    redirect(tenantLoginUrl(org?.slug ?? 'login', '?blocked=1'));
  }
  return u;
}

/** Do'kon egasi (kichik admin) bo'lishini talab qiladi */
export async function requireOrgAdmin(): Promise<SessionUser> {
  const u = await requireOrgUser();
  if (u.role !== 'admin') redirect('/app');
  return u;
}

async function OrganizationById(id: string): Promise<IOrganization | null> {
  const { Organization } = await getMasterModels();
  return Organization.findById(id).lean();
}

/** Faol do'kon + yoqilgan modullar */
export async function requireOrgWithFeatures(): Promise<{
  user: SessionUser;
  org: IOrganization & { _id: string };
  features: OrgFeatures;
}> {
  const user = await requireOrgUser();
  const org = await resolveTenant();
  if (!org) redirect(superLoginUrl());
  return { user, org, features: resolveOrgFeatures(org) };
}

/** Modul yoqilganligini tekshiradi */
export async function requireFeature(key: FeatureKey): Promise<{
  user: SessionUser;
  org: IOrganization & { _id: string };
  features: OrgFeatures;
}> {
  const ctx = await requireOrgWithFeatures();
  if (!ctx.features[key]) redirect('/app?module=disabled');
  return ctx;
}
