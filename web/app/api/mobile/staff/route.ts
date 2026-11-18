import { NextResponse } from 'next/server';
import { authenticateMobile } from '@/lib/mobileAuth';
import { mobilePermissionDenied } from '@/lib/permissionGuard';
import { getMasterModels } from '@/lib/masterDb';
import { getTenantModels } from '@/lib/tenantDb';
import { ensureDefaultRoles } from '@/lib/roles';
import { resolveOrgPlan } from '@/lib/plans';
import { createStaff, isStaffLogin, updateStaff } from '@/lib/staff';
import { getDictionary } from '@/lib/i18n/dict';
import { mobileLocale } from '@/lib/restaurant/session';
import { logError } from '@/lib/logger';
import type { SessionUser } from '@/lib/session';

/**
 * Xodimlar (bir filialga bir nechta login) — mobil ilova «Filiallar» ekrani. Mantiq: lib/staff.ts (web bilan umumiy).
 *   GET   → { items, branches, roles, limit: { used, max } }
 *   POST  { branchId, fullName, username, password, roleId? } → 201 { id, username, fullName }
 *   PATCH { userId, active?, fullName?, branchId?, newPassword? } → { id }
 * Faqat biznes egasi + «users.manage» (POST /api/mobile/branches kabi). Xato matnlari — ilova tilida.
 */
type Ctx = { user: SessionUser; dbName: string; organizationId: string };

async function guard(req: Request): Promise<Ctx | NextResponse> {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth.dbName || !auth.organizationId) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  if (auth.role !== 'admin') return NextResponse.json({ error: getDictionary(mobileLocale(req)).crm.team.errAdminAlways }, { status: 403 });
  const denied = await mobilePermissionDenied(auth, 'users.manage');
  if (denied) return denied;
  return { user: auth, dbName: auth.dbName, organizationId: auth.organizationId };
}

async function orgOf(id: string) {
  const { Organization } = await getMasterModels();
  return Organization.findById(id).select('dbName plan businessType').lean();
}

export async function GET(req: Request) {
  const c = await guard(req);
  if (c instanceof NextResponse) return c;
  const org = await orgOf(c.organizationId);
  if (!org) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  const { User, Branch, Role } = await getTenantModels(c.dbName);
  await ensureDefaultRoles(Role, org.businessType);
  const [branches, users, roles] = await Promise.all([
    Branch.find().select('name isMain active').sort({ isMain: -1, createdAt: 1 }).lean(),
    User.find({ role: 'user' }).select('username fullName branchId staff roleId active createdAt').sort({ createdAt: 1 }).lean(),
    Role.find().select('name').sort({ name: 1 }).lean(),
  ]);
  const branchById = new Map(branches.map((b) => [String(b._id), b]));
  const roleById = new Map(roles.map((r) => [String(r._id), r.name]));
  const items = users
    .filter((u) => isStaffLogin(u, u.branchId ? branchById.get(String(u.branchId)) : null))
    .map((u) => ({
      id: String(u._id),
      username: u.username,
      name: u.fullName || u.username,
      branchId: u.branchId ? String(u.branchId) : null,
      branchName: u.branchId ? branchById.get(String(u.branchId))?.name ?? null : null,
      roleName: u.roleId ? roleById.get(String(u.roleId)) ?? null : null,
      active: u.active !== false,
    }));
  const used = await User.countDocuments({ active: true });
  return NextResponse.json({
    items,
    branches: branches.filter((b) => b.active).map((b) => ({ id: String(b._id), name: b.name, isMain: !!b.isMain })),
    roles: roles.map((r) => ({ id: String(r._id), name: r.name })),
    limit: { used, max: resolveOrgPlan({ plan: org.plan }).maxUsers },
  });
}

export async function POST(req: Request) {
  const c = await guard(req);
  if (c instanceof NextResponse) return c;
  const d = getDictionary(mobileLocale(req));
  let body: { branchId?: string; fullName?: string; username?: string; password?: string; roleId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: d.common.invalidInput }, { status: 400 }); }
  const org = await orgOf(c.organizationId);
  if (!org) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  try {
    const m = await getTenantModels(c.dbName);
    const r = await createStaff(m, { _id: org._id, dbName: org.dbName, plan: org.plan }, c.user, {
      branchId: String(body.branchId ?? ''),
      fullName: String(body.fullName ?? ''),
      username: String(body.username ?? ''),
      password: String(body.password ?? ''),
      roleId: String(body.roleId ?? ''),
    }, d, ' (mobil)');
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ id: r.data.id, username: r.data.username, fullName: r.data.fullName }, { status: 201 });
  } catch (e) {
    logError('mobile staff create failed', e);
    return NextResponse.json({ error: d.crm.team.errCreate }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const c = await guard(req);
  if (c instanceof NextResponse) return c;
  const d = getDictionary(mobileLocale(req));
  let body: { userId?: string; active?: boolean; fullName?: string; branchId?: string; newPassword?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: d.common.invalidInput }, { status: 400 }); }
  const org = await orgOf(c.organizationId);
  if (!org) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  try {
    const m = await getTenantModels(c.dbName);
    const r = await updateStaff(m, { _id: org._id, dbName: org.dbName, plan: org.plan }, c.user, {
      userId: String(body.userId ?? ''),
      ...(typeof body.active === 'boolean' ? { active: body.active } : {}),
      ...(typeof body.fullName === 'string' ? { fullName: body.fullName } : {}),
      ...(typeof body.branchId === 'string' && body.branchId ? { branchId: body.branchId } : {}),
      ...(typeof body.newPassword === 'string' ? { newPassword: body.newPassword } : {}),
    }, d, ' (mobil)');
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json(r.data);
  } catch (e) {
    logError('mobile staff update failed', e);
    return NextResponse.json({ error: d.restaurant.errors.failed }, { status: 500 });
  }
}
