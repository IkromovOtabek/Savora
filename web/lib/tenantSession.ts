import { requireOrgAdminWithOrg, requireOrgWithFeatures } from './auth';
import { getTenantModels } from './tenantDb';
import { getMasterModels } from './masterDb';
import { IOrganization } from './models/master/Organization';
import { OrgFeatures, resolveOrgFeatures } from './features';

/** Joriy do'kon foydalanuvchisi + tenant modellari + modullar */
export async function getTenantSession(opts?: { allowExpired?: boolean }) {
  const { user, org, features } = await requireOrgWithFeatures(opts);
  const models = await getTenantModels(user.dbName!);
  return { user, org, features, ...models };
}

/** Admin huquqi + tenant modellari + modullar */
export async function getTenantAdminSession(opts?: { allowExpired?: boolean }) {
  // Do'kon sessiyadagi organizationId'dan (slug/cookie'dan emas)
  const { user, org } = await requireOrgAdminWithOrg(opts);
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
