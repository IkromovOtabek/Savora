import { getMasterModels } from './masterDb';
import { resolveOrgFeatures, OrgFeatures } from './features';

/** Mobil endpointlar uchun: foydalanuvchi do'konining yoqilgan modullari (features). */
export async function getMobileFeatures(organizationId?: string): Promise<OrgFeatures | null> {
  if (!organizationId) return null;
  const { Organization } = await getMasterModels();
  const org = await Organization.findById(organizationId).lean();
  return org ? resolveOrgFeatures(org) : null;
}
