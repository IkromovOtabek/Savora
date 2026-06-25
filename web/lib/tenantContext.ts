import { headers } from 'next/headers';
import { getMasterModels } from './masterDb';
import { IOrganization } from './models/master/Organization';
import { getSession } from './session';

export type AppZone = 'root' | 'super' | 'tenant';

/** Middleware o'rnatgan zona (asosiy sayt / super admin / do'kon) */
export async function getAppZone(): Promise<AppZone> {
  const h = await headers();
  return (h.get('x-app-zone') as AppZone) || 'root';
}

/** Joriy subdomen yoki path slug (do'kon) */
export async function getTenantSlug(): Promise<string> {
  const h = await headers();
  const fromHeader = h.get('x-tenant-slug') || '';
  if (fromHeader) return fromHeader;

  const user = await getSession('tenant').then((s) => s.user);
  if (user?.organizationId) {
    const { Organization } = await getMasterModels();
    const org = await Organization.findById(user.organizationId).select('slug').lean();
    return org?.slug ?? '';
  }
  return '';
}

/** Subdomen yoki sessiya bo'yicha do'konni master DB'dan topish */
export async function resolveTenant(): Promise<(IOrganization & { _id: string }) | null> {
  const slug = await getTenantSlug();
  const { Organization } = await getMasterModels();

  if (slug) {
    const org = await Organization.findOne({ slug }).lean<IOrganization & { _id: unknown }>();
    if (!org) return null;
    return { ...org, _id: String(org._id) };
  }

  const user = await getSession('tenant').then((s) => s.user);
  if (user?.organizationId) {
    const org = await Organization.findById(user.organizationId).lean<IOrganization & { _id: unknown }>();
    if (!org) return null;
    return { ...org, _id: String(org._id) };
  }

  return null;
}
