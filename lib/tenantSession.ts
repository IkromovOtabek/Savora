import { requireOrgAdmin, requireOrgUser, requireOrgWithFeatures } from './auth';
import { resolveTenant } from './tenantContext';
import { getTenantModels } from './tenantDb';
import { getMasterModels } from './masterDb';
import { IOrganization } from './models/master/Organization';
import { OrgFeatures, resolveOrgFeatures } from './features';

/** Joriy do'kon foydalanuvchisi + tenant modellari + modullar */
export async function getTenantSession() {
  const { user, org, features } = await requireOrgWithFeatures();
  const models = await getTenantModels(user.dbName!);
  return { user, org, features, ...models };
}

/** Admin huquqi + tenant modellari + modullar */
export async function getTenantAdminSession() {
  const user = await requireOrgAdmin();
  const org = await resolveTenant();
  if (!org) throw new Error('Do\'kon topilmadi.');
  const features = resolveOrgFeatures(org);
  const models = await getTenantModels(user.dbName!);
  return { user, org, features, ...models };
}

/** Tarif limitlarini tekshirish uchun to'liq org */
export async function getOrgWithPlan(organizationId: string): Promise<IOrganization | null> {
  const { Organization } = await getMasterModels();
  return Organization.findById(organizationId).lean();
}

export { resolveOrgFeatures };
export type { OrgFeatures };
