'use server';

import { revalidatePath } from 'next/cache';
import { getTenantAdminSession } from '@/lib/tenantSession';
import { markOnboardingStep } from '@/lib/onboarding';
import { recordAudit } from '@/lib/audit';
import { addOrgUser, updateOrgUserByUsername, removeOrgUserByBranch } from '@/lib/orgUsers';
import { staffCountInBranch } from '@/lib/staff';
import { reserveUsername, releaseUsername, isUsernameAvailable, UsernameTakenError } from '@/lib/userDirectory';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import { checkPermission } from '@/lib/permissionGuard';

type State = { error?: string; success?: string } | null;

function normalizeLogin(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, '');
}

/** Filial yaratish — filial + uning login/paroli birga yaratiladi */
export async function createFilialAction(_prev: State, formData: FormData): Promise<State> {
  const { user, User, Branch, org } = await getTenantAdminSession();
  // «Jamoa» moduli o'chiq bo'lsa (Super Admin) — action to'g'ridan-to'g'ri chaqirilsa ham bloklanadi
  { const denied = await checkPermission(user, 'users.manage'); if (denied) return denied; }
  const d = await getDict();
  const T = d.crm.team;

  // Yumshoq chegara: filial qo'shish bloklanmaydi. Limitdan oshsa — sahifada
  // "tarifni yangilang" yo'naltiruvchi karta ko'rsatiladi (client tiqilib qolmaydi).

  const name = String(formData.get('name') || '').trim();
  const address = String(formData.get('address') || '').trim();
  const phone = String(formData.get('phone') || '').trim();
  const username = normalizeLogin(String(formData.get('username') || ''));
  const password = String(formData.get('password') || '');

  if (!name) return { error: T.errBranchName };
  if (username.length < 3) return { error: T.errLoginShort };
  if (password.length < 6) return { error: T.errPasswordShort };

  const dup = await User.findOne({ username }).lean();
  if (dup) return { error: T.errLoginTaken };
  // Global (butun platforma bo'yicha) band emasligini tekshiramiz — slug'siz login uchun shart.
  if (!(await isUsernameAvailable(username))) return { error: T.errLoginTakenGlobal };

  try {
    const branch = await Branch.create({ name, address: address || undefined, phone: phone || undefined, active: true });
    const u = new User({
      username,
      password,
      role: 'user',
      fullName: name,
      branchId: branch._id,
      active: true,
      mustChangePassword: false,
    });
    await u.save();
    // Global registrga yozamiz. Poyga tufayli band bo'lsa — filial va loginni bekor qilamiz.
    try {
      await reserveUsername({
        username,
        organizationId: String(org._id),
        dbName: org.dbName,
        role: 'user',
        branchId: String(branch._id),
      });
    } catch (e) {
      await User.deleteOne({ _id: u._id });
      await Branch.findByIdAndDelete(branch._id);
      return { error: e instanceof UsernameTakenError ? T.errLoginTakenGlobal : T.errCreate };
    }
    await markOnboardingStep(user.organizationId, 'branchCreated');
    await addOrgUser(user.organizationId, { username, name, role: 'user', branchId: String(branch._id) });
    await recordAudit(user, {
      action: 'branch.create',
      entity: 'branch',
      entityId: String(branch._id),
      summary: `Filial yaratildi: ${name} (login: ${username})`,
    });
    revalidatePath('/app');
    revalidatePath('/app/users');
    revalidatePath('/app/products');
    return { success: tr(T.created, { name, username }) };
  } catch {
    return { error: T.errCreate };
  }
}

/** Filial yangilash — filial + login (parol, holat) */
export async function updateFilialAction(_prev: State, formData: FormData): Promise<State> {
  const { user, User, Branch } = await getTenantAdminSession();
  { const denied = await checkPermission(user, 'users.manage'); if (denied) return denied; }
  const d = await getDict();
  const T = d.crm.team;

  const branchId = String(formData.get('branchId') || '');
  const name = String(formData.get('name') || '').trim();
  const address = String(formData.get('address') || '').trim();
  const phone = String(formData.get('phone') || '').trim();
  const active = formData.get('active') === 'on';
  const newPassword = String(formData.get('newPassword') || '');

  if (!branchId || !name) return { error: T.errBranchName };

  const branch = await Branch.findById(branchId);
  if (!branch) return { error: T.errNotFound };

  branch.name = name;
  branch.address = address || undefined;
  branch.phone = phone || undefined;
  branch.active = active;
  await branch.save();

  // Filialning o'z logini (eng birinchisi). Shu filialdagi xodimlar (staff) bu yerda o'zgarmaydi — ularning
  // ismi, holati va paroli «Xodimni tahrirlash» orqali (lib/staff.ts)
  const u = branch.isMain ? null : await User.findOne({ branchId, role: 'user', staff: { $ne: true } }).sort({ createdAt: 1 });
  if (u) {
    u.fullName = name;
    u.active = active;
    if (newPassword && newPassword.length >= 6) {
      u.password = newPassword;
      u.tokenVersion = (u.tokenVersion ?? 0) + 1;
      u.mustChangePassword = false;
    } else if (newPassword && newPassword.length < 6) {
      return { error: T.errNewPasswordShort };
    }
    await u.save();
  }

  // Nusxa login bo'yicha (filialda xodimlar ham bo'lishi mumkin — branchId bo'yicha birinchisi xodim chiqishi mumkin)
  if (u) await updateOrgUserByUsername(user.organizationId, u.username, { name });

  await recordAudit(user, {
    action: newPassword && newPassword.length >= 6 ? 'branch.reset_password' : 'branch.update',
    entity: 'branch',
    entityId: branchId,
    summary:
      `Filial yangilandi: ${name}` +
      (newPassword && newPassword.length >= 6 ? ' (parol almashtirildi)' : '') +
      (!active ? ' (nofaol qilindi)' : ''),
  });

  revalidatePath('/app');
  revalidatePath('/app/users');
  revalidatePath('/app/products');
  return { success: T.saved };
}

/** Filialni o'chirish — login va filial yo'q qilinadi (mahsulot bo'lsa bloklanadi) */
export async function deleteFilialAction(_prev: State, formData: FormData): Promise<State> {
  const { user, User, Branch, Product, Sale } = await getTenantAdminSession();
  { const denied = await checkPermission(user, 'users.manage'); if (denied) return denied; }
  const d = await getDict();
  const T = d.crm.team;
  const branchId = String(formData.get('branchId') || '');
  if (!branchId) return { error: T.errNotFound };

  const [productCount, saleCount] = await Promise.all([
    Product.countDocuments({ branchId }),
    Sale.countDocuments({ branchId }),
  ]);
  if (productCount > 0 || saleCount > 0) {
    return { error: tr(T.errHasData, { products: productCount, sales: saleCount }) };
  }
  const target = await Branch.findById(branchId).select('isMain').lean();
  if (!target || target.isMain) return { error: T.errNotFound };
  // Filialning o'z logini; qolganlari — xodimlar. Xodim bor filial o'chirilmaydi (loginlar egasiz qolmasin)
  const delUser = await User.findOne({ branchId, role: 'user', staff: { $ne: true } }).sort({ createdAt: 1 }).lean();
  const staffN = await staffCountInBranch({ User }, branchId, delUser ? String(delUser._id) : undefined);
  if (staffN > 0) return { error: tr(T.staff.errHasStaff, { n: staffN }) };

  const branch = await Branch.findByIdAndDelete(branchId).lean();
  // Loginni global registrdan ham olib tashlaymiz (o'chirishdan oldin username'ni olamiz).
  if (delUser) await User.deleteOne({ _id: delUser._id });
  if (delUser?.username) await releaseUsername(delUser.username);
  await removeOrgUserByBranch(user.organizationId, branchId);
  await recordAudit(user, {
    action: 'branch.delete',
    entity: 'branch',
    entityId: branchId,
    summary: `Filial o'chirildi: ${branch?.name ?? branchId}`,
  });
  revalidatePath('/app');
  revalidatePath('/app/users');
  return { success: T.deleted };
}
