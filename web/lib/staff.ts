/**
 * Xodimlar — bir filialga bir nechta login (ofitsant, oshpaz, kassir, sex ishchisi…).
 *
 *  - «Filial» — alohida savdo nuqtasi (o'z ombori, kassasi) va uning ASOSIY logini (app/actions/filials.ts).
 *  - «Xodim» — mavjud filialga (yoki egasining asosiy omboriga — bitta joyli restoran/sex) biriktirilgan
 *    qo'shimcha login: o'z ismi (`fullName` — chek, KDS, pre-chek, hisobotlarda ko'rinadi), paroli va roli.
 *    `User.staff = true`. Asosiy omborga (isMain) bog'langan login har doim xodim (ombor filialining o'z logini yo'q).
 *
 * Web (/app/users → app/actions/staff.ts) va mobil API (/api/mobile/staff) shu funksiyalarni chaqiradi —
 * qoidalar bir joyda: login formati (orgLogins LOGIN_RE), parol ≥ 6, tarif `maxUsers` (faol loginlar,
 * checkPlanLimits — bosh sahifadagi limit kartasi bilan bir xil sanoq), global login registri (userDirectory),
 * super admin uchun nusxa (orgUsers), audit.
 */
import { isValidObjectId, type Types } from 'mongoose';
import type { getTenantModels } from './tenantDb';
import type { Dict } from './i18n/dict';
import { tr } from './i18n/fmt';
import { recordAudit } from './audit';
import { checkPlanLimits, resolveOrgPlan, type OrgPlanSource } from './plans';
import { LOGIN_RE, normalizeLoginInput } from './orgLogins';
import { isUsernameAvailable, releaseUsername, reserveUsername, updateDirectoryBranch, UsernameTakenError } from './userDirectory';
import { addOrgUser, removeOrgUserByUsername, updateOrgUserByUsername } from './orgUsers';

type Models = Awaited<ReturnType<typeof getTenantModels>>;
type StaffModels = Pick<Models, 'User' | 'Branch' | 'Role' | 'Order' | 'Sale'>;

export const STAFF_LIMITS = { name: 80, password: 128, minPassword: 6 } as const;

export interface StaffActor {
  username: string;
  role: 'admin' | 'user' | 'super_admin';
  dbName?: string;
  organizationId?: string;
}

export interface StaffOrg {
  _id: unknown;
  dbName: string;
  plan: OrgPlanSource;
}

export type StaffResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

const bad = (error: string, status = 400): { ok: false; error: string; status: number } => ({ ok: false, error, status });

/** Login xodimmi (filialning o'z logini emas)? Asosiy omborga bog'langan login — har doim xodim */
export function isStaffLogin(u: { role?: string; staff?: boolean | null }, branch?: { isMain?: boolean | null } | null): boolean {
  if (u.role !== 'user') return false;
  return u.staff === true || !!branch?.isMain;
}

/** Faol loginlar soni ≥ tarif limiti (egasi ham sanaladi — bosh sahifadagi PlanLimitsBanner bilan bir xil) */
async function userLimitReached(m: Pick<StaffModels, 'User'>, org: StaffOrg): Promise<{ reached: boolean; max: number }> {
  const plan = resolveOrgPlan({ plan: org.plan });
  const users = await m.User.countDocuments({ active: true });
  return { reached: checkPlanLimits(plan, { users, branches: 0, products: 0 }).usersAtLimit, max: plan.maxUsers };
}

async function activeBranch(m: Pick<StaffModels, 'Branch'>, branchId: string) {
  if (!isValidObjectId(branchId)) return null;
  return m.Branch.findOne({ _id: branchId, active: true }).select('name isMain').lean();
}

export interface CreateStaffInput {
  branchId: string;
  fullName: string;
  username: string;
  password: string;
  /** Rol shabloni (Ofitsant, Oshpaz, Kassir…); bo'sh — filial standart huquqlari */
  roleId?: string;
}

/** Yangi xodim: mavjud filialga login + ism + rol. Tarif limiti va global login bandligi tekshiriladi */
export async function createStaff(
  m: StaffModels,
  org: StaffOrg,
  actor: StaffActor,
  input: CreateStaffInput,
  d: Dict,
  via = '',
): Promise<StaffResult<{ id: string; username: string; fullName: string; branchId: string }>> {
  const T = d.crm.team;
  const S = T.staff;
  const fullName = String(input.fullName ?? '').trim().replace(/\s+/g, ' ');
  const username = normalizeLoginInput(String(input.username ?? ''));
  const password = String(input.password ?? '');
  const roleId = String(input.roleId ?? '').trim();

  if (!fullName) return bad(S.errName);
  if (fullName.length > STAFF_LIMITS.name) return bad(S.errNameLong);
  if (!LOGIN_RE.test(username)) return bad(username.length < 3 ? T.errLoginShort : S.errLoginFormat);
  if (password.length < STAFF_LIMITS.minPassword) return bad(T.errPasswordShort);
  if (password.length > STAFF_LIMITS.password) return bad(S.errPasswordLong);

  const branch = await activeBranch(m, String(input.branchId ?? ''));
  if (!branch) return bad(S.errBranch);
  let role: { _id: Types.ObjectId; name: string } | null = null;
  if (roleId) {
    role = isValidObjectId(roleId) ? await m.Role.findById(roleId).select('name').lean() : null;
    if (!role) return bad(S.errRole);
  }

  const limit = await userLimitReached(m, org);
  if (limit.reached) return bad(tr(S.errUserLimit, { max: limit.max }), 403);

  if (await m.User.exists({ username })) return bad(T.errLoginTaken, 409);
  if (!(await isUsernameAvailable(username))) return bad(T.errLoginTakenGlobal, 409);

  const u = new m.User({
    username,
    password,
    role: 'user',
    fullName,
    branchId: branch._id,
    staff: true,
    ...(role ? { roleId: role._id } : {}),
    active: true,
    mustChangePassword: false,
  });
  try {
    await u.save();
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) return bad(T.errLoginTaken, 409);
    throw e;
  }
  // Global registr (slug'siz kirish). Poyga tufayli band bo'lsa — login bekor qilinadi
  try {
    await reserveUsername({
      username,
      organizationId: String(org._id),
      dbName: org.dbName,
      role: 'user',
      branchId: String(branch._id),
    });
  } catch (e) {
    await m.User.deleteOne({ _id: u._id });
    if (e instanceof UsernameTakenError) return bad(T.errLoginTakenGlobal, 409);
    throw e;
  }
  await addOrgUser(actor.organizationId, { username, name: fullName, role: 'user', branchId: String(branch._id) });
  await recordAudit(actor, {
    action: 'user.create',
    entity: 'user',
    entityId: String(u._id),
    summary: `Xodim qo'shildi: ${fullName} (login: ${username}) — ${branch.name}${role ? `, rol: ${role.name}` : ''}${via}`,
  });
  return { ok: true, data: { id: String(u._id), username, fullName, branchId: String(branch._id) } };
}

export interface UpdateStaffInput {
  userId: string;
  fullName?: string;
  branchId?: string;
  active?: boolean;
  /** Bo'sh — parol o'zgarmaydi */
  newPassword?: string;
}

/**
 * Xodimni tahrirlash: ism, filial, holat (bloklash), yangi parol. Filial, holat yoki parol o'zgarsa —
 * ochiq sessiyalar yopiladi (tokenVersion; sessiyada branchId saqlanadi).
 */
export async function updateStaff(
  m: StaffModels,
  org: StaffOrg,
  actor: StaffActor & { id?: string },
  input: UpdateStaffInput,
  d: Dict,
  via = '',
): Promise<StaffResult<{ id: string }>> {
  const T = d.crm.team;
  const S = T.staff;
  if (!isValidObjectId(input.userId)) return bad(T.errUserNotFound, 404);
  if (actor.id && actor.id === input.userId) return bad(S.errSelf);
  const u = await m.User.findById(input.userId);
  if (!u || u.role !== 'user') return bad(T.errUserNotFound, 404);
  const curBranch = u.branchId ? await m.Branch.findById(u.branchId).select('name isMain').lean() : null;
  if (!isStaffLogin(u, curBranch)) return bad(S.errNotStaff);

  const notes: string[] = [];
  let revoke = false;

  if (input.fullName !== undefined) {
    const fullName = String(input.fullName).trim().replace(/\s+/g, ' ');
    if (!fullName) return bad(S.errName);
    if (fullName.length > STAFF_LIMITS.name) return bad(S.errNameLong);
    if (fullName !== u.fullName) { notes.push(`ism: ${u.fullName ?? '—'} → ${fullName}`); u.fullName = fullName; }
  }
  let movedTo: string | undefined;
  if (input.branchId && input.branchId !== String(u.branchId ?? '')) {
    const branch = await activeBranch(m, input.branchId);
    if (!branch) return bad(S.errBranch);
    notes.push(`filial: ${curBranch?.name ?? '—'} → ${branch.name}`);
    u.branchId = branch._id;
    movedTo = String(branch._id);
    revoke = true;
  }
  if (input.active !== undefined && input.active !== u.active) {
    if (input.active) {
      const limit = await userLimitReached(m, org);
      if (limit.reached) return bad(tr(S.errUserLimit, { max: limit.max }), 403);
    }
    u.active = input.active;
    notes.push(input.active ? 'faollashtirildi' : 'bloklandi');
    revoke = true;
  }
  const pwd = String(input.newPassword ?? '');
  if (pwd) {
    if (pwd.length < STAFF_LIMITS.minPassword) return bad(T.errNewPasswordShort);
    if (pwd.length > STAFF_LIMITS.password) return bad(S.errPasswordLong);
    u.password = pwd;
    u.mustChangePassword = false;
    notes.push('parol almashtirildi');
    revoke = true;
  }
  // Eski filial loginidan xodimga o'tishda belgi (asosiy omborda bo'lgan bo'lsa ham) aniq turadi
  u.staff = true;
  if (revoke) u.tokenVersion = (u.tokenVersion ?? 0) + 1;
  await u.save();

  if (movedTo) await updateDirectoryBranch(u.username, movedTo).catch(() => {});
  await updateOrgUserByUsername(actor.organizationId, u.username, { name: u.fullName, ...(movedTo ? { branchId: movedTo } : {}) });
  if (notes.length) {
    await recordAudit(actor, {
      action: pwd ? 'user.reset_password' : 'user.update',
      entity: 'user',
      entityId: String(u._id),
      summary: `Xodim yangilandi: ${u.fullName ?? u.username} (@${u.username}) — ${notes.join(', ')}${via}`,
    });
  }
  return { ok: true, data: { id: String(u._id) } };
}

/**
 * Xodimni o'chirish. Buyurtma yoki sotuv tarixi bor xodim o'chirilmaydi (chek/hisobotda ismi yo'qolmasin) —
 * o'rniga nofaol qilinadi.
 */
export async function deleteStaff(
  m: StaffModels,
  actor: StaffActor & { id?: string },
  userId: string,
  d: Dict,
  via = '',
): Promise<StaffResult<{ id: string }>> {
  const T = d.crm.team;
  const S = T.staff;
  if (!isValidObjectId(userId)) return bad(T.errUserNotFound, 404);
  if (actor.id && actor.id === userId) return bad(S.errSelf);
  const u = await m.User.findById(userId).select('username fullName role staff branchId').lean();
  if (!u || u.role !== 'user') return bad(T.errUserNotFound, 404);
  const branch = u.branchId ? await m.Branch.findById(u.branchId).select('isMain').lean() : null;
  if (!isStaffLogin(u, branch)) return bad(S.errNotStaff);

  const [orders, sales] = await Promise.all([
    m.Order.countDocuments({ waiterId: String(u._id) }),
    m.Sale.countDocuments({ soldBy: u.username }),
  ]);
  if (orders > 0 || sales > 0) return bad(tr(S.errHasHistory, { orders, sales }), 409);

  await m.User.deleteOne({ _id: u._id });
  await releaseUsername(u.username).catch(() => {});
  await removeOrgUserByUsername(actor.organizationId, u.username);
  await recordAudit(actor, {
    action: 'user.delete',
    entity: 'user',
    entityId: String(u._id),
    summary: `Xodim o'chirildi: ${u.fullName ?? u.username} (@${u.username})${via}`,
  });
  return { ok: true, data: { id: String(u._id) } };
}

/** Filialga biriktirilgan xodimlar soni (filialni o'chirishdan oldin) */
export async function staffCountInBranch(m: Pick<StaffModels, 'User'>, branchId: string, exceptUserId?: string): Promise<number> {
  return m.User.countDocuments({
    branchId,
    role: 'user',
    ...(exceptUserId ? { _id: { $ne: exceptUserId } } : {}),
  });
}
