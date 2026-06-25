import { getMasterModels } from './masterDb';

/**
 * Do'kon ichidagi loginlar nusxasini master Organization hujjatida saqlash —
 * super admin biznes bo'yicha loginlarni ko'ra olishi uchun. Manba — tenant DB,
 * bu yerda faqat nusxa. Hech qachon throw qilmaydi (asosiy oqimni buzmaydi).
 */
interface OrgUserEntry {
  username: string;
  name?: string;
  role?: 'admin' | 'user';
  branchId?: string;
}

export async function addOrgUser(organizationId: string | undefined, entry: OrgUserEntry): Promise<void> {
  try {
    if (!organizationId) return;
    const { Organization } = await getMasterModels();
    await Organization.updateOne(
      { _id: organizationId },
      { $push: { users: { ...entry, createdAt: new Date() } } }
    );
  } catch {
    /* nusxa saqlanmadi — e'tiborsiz */
  }
}

export async function updateOrgUserByBranch(
  organizationId: string | undefined,
  branchId: string,
  patch: { name?: string; username?: string }
): Promise<void> {
  try {
    if (!organizationId || !branchId) return;
    const set: Record<string, unknown> = {};
    if (patch.name !== undefined) set['users.$.name'] = patch.name;
    if (patch.username !== undefined) set['users.$.username'] = patch.username;
    if (Object.keys(set).length === 0) return;
    const { Organization } = await getMasterModels();
    await Organization.updateOne({ _id: organizationId, 'users.branchId': branchId }, { $set: set });
  } catch {
    /* e'tiborsiz */
  }
}

export async function removeOrgUserByBranch(organizationId: string | undefined, branchId: string): Promise<void> {
  try {
    if (!organizationId || !branchId) return;
    const { Organization } = await getMasterModels();
    await Organization.updateOne({ _id: organizationId }, { $pull: { users: { branchId } } });
  } catch {
    /* e'tiborsiz */
  }
}
