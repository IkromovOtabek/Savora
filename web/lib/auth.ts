import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getSession, SessionUser } from './session';
import { getMasterModels } from './masterDb';
import { getTenantModels } from './tenantDb';
import { IOrganization, isOrganizationActive } from './models/master/Organization';
import { FeatureKey, OrgFeatures, resolveOrgFeatures } from './features';
import { resolveTenant } from './tenantContext';
import { superLoginUrl, tenantAppUrl, tenantLoginUrl, usePathRouting } from './urls';

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
  const session = await getSession('super');
  const u = session.user;
  if (!u || u.role !== 'super_admin') redirect(superLoginUrl());
  if (!(await verifyTokenVersion(u))) redirect(superLoginUrl());
  return u;
}

/**
 * Do'kon foydalanuvchisi + uning do'koni. Do'kon FAQAT sessiyadagi organizationId'dan
 * olinadi (slug/cookie'dan emas) — slug yoki sp_tenant cookie'ni almashtirib boshqa
 * do'kon modullari/ma'lumotini ko'rish mumkin bo'lmasligi uchun.
 */
async function requireOrgUserWithOrg(opts?: { allowExpired?: boolean }): Promise<{
  user: SessionUser;
  org: IOrganization & { _id: string };
}> {
  const session = await getSession('tenant');
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
  // Sessiyadagi dbName do'kon bazasiga mos bo'lishi shart
  if (!org || org.dbName !== u.dbName) redirect(tenantLoginUrl('login', '?blocked=1'));
  // Super admin to'xtatgan (suspended) — qattiq blok, login'ga qaytadi
  if (org.status === 'suspended') {
    redirect(tenantLoginUrl(org.slug, '?blocked=1'));
  }
  // Subdomen rejimida boshqa do'kon subdomenidan kirilsa — o'z do'koniga yo'naltiramiz.
  // (Path rejimida slug faqat sp_tenant cookie'dan keladi — e'tiborsiz, sessiya ustun.)
  if (!usePathRouting()) {
    const slug = await headerTenantSlug();
    if (slug && slug !== org.slug) redirect(tenantAppUrl(org.slug, '/app'));
  }
  // Muddati tugagan — login bo'ladi, lekin faqat to'lov sahifasiga kiradi
  if (!isOrganizationActive(org) && !opts?.allowExpired) {
    redirect('/app/expired');
  }
  return { user: u, org: { ...org, _id: String((org as { _id?: unknown })._id) } };
}

async function headerTenantSlug(): Promise<string> {
  try {
    const h = await headers();
    return h.get('x-tenant-slug') || '';
  } catch {
    return '';
  }
}

/**
 * API route'lar uchun (redirect qilmaydi): tenant sessiyasi + tokenVersion + do'kon holati.
 * Yaroqsiz bo'lsa null — chaqiruvchi 401/403 qaytaradi.
 */
export async function getApiTenantContext(opts?: { allowExpired?: boolean }): Promise<{
  user: SessionUser;
  org: IOrganization & { _id: string };
} | null> {
  try {
    const session = await getSession('tenant');
    const u = session.user;
    if (!u || (u.role !== 'admin' && u.role !== 'user') || !u.dbName || !u.organizationId) return null;
    if (!(await verifyTokenVersion(u))) return null;
    const org = await OrganizationById(u.organizationId);
    if (!org || org.dbName !== u.dbName || org.status === 'suspended') return null;
    if (!isOrganizationActive(org) && !opts?.allowExpired) return null;
    return { user: u, org: { ...org, _id: String((org as { _id?: unknown })._id) } };
  } catch {
    return null;
  }
}

/** Do'kon foydalanuvchisi (admin yoki user) + do'kon faolligini talab qiladi */
export async function requireOrgUser(opts?: { allowExpired?: boolean }): Promise<SessionUser> {
  const { user } = await requireOrgUserWithOrg(opts);
  return user;
}

/** Do'kon egasi (kichik admin) bo'lishini talab qiladi */
export async function requireOrgAdmin(opts?: { allowExpired?: boolean }): Promise<SessionUser> {
  const u = await requireOrgUser(opts);
  if (u.role !== 'admin') redirect('/app');
  return u;
}

/** Do'kon egasi + sessiya do'koni (slug'dan emas) */
export async function requireOrgAdminWithOrg(opts?: { allowExpired?: boolean }): Promise<{
  user: SessionUser;
  org: IOrganization & { _id: string };
}> {
  const ctx = await requireOrgUserWithOrg(opts);
  if (ctx.user.role !== 'admin') redirect('/app');
  return ctx;
}

async function OrganizationById(id: string): Promise<IOrganization | null> {
  const { Organization } = await getMasterModels();
  return Organization.findById(id).lean();
}

/** Faol do'kon + yoqilgan modullar */
export async function requireOrgWithFeatures(opts?: { allowExpired?: boolean }): Promise<{
  user: SessionUser;
  org: IOrganization & { _id: string };
  features: OrgFeatures;
}> {
  // Modullar sessiya do'konidan hisoblanadi (slug'dan emas)
  const { user, org } = await requireOrgUserWithOrg(opts);
  return { user, org, features: resolveOrgFeatures(org) };
}

/** Modul yoqilganligini tekshiradi */
export async function requireFeature(key: FeatureKey): Promise<{
  user: SessionUser;
  org: IOrganization & { _id: string };
  features: OrgFeatures;
}> {
  const ctx = await requireOrgWithFeatures();
  // Tarifga kirmagan modul — link orqali kirilsa ham bloklab, modul nomini ko'rsatamiz
  if (!ctx.features[key]) redirect(`/app/locked?m=${key}`);
  return ctx;
}
