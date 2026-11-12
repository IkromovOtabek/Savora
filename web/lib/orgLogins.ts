import { isValidObjectId } from 'mongoose';
import { getMasterModels } from './masterDb';
import { getTenantModels } from './tenantDb';
import { generateTempPassword } from './credentials';
import { reserveUsername, releaseUsername, UsernameTakenError } from './userDirectory';

/**
 * Super Admin — do'kon ichidagi istalgan login (egasi yoki filial) nomini va parolini o'zgartirish.
 * Manba — tenant `users`; global registr (user_directory), Organization.adminUsername va
 * Organization.users nusxasi shu yerda sinxron yangilanadi.
 */

const LOGIN_RE = /^[a-z0-9][a-z0-9_.-]{2,39}$/;

export function normalizeLoginInput(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, '');
}

export class LoginChangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoginChangeError';
  }
}

export interface OrgLoginRow {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'user';
  active: boolean;
  mustChangePassword: boolean;
}

export async function listOrgLogins(dbName: string): Promise<OrgLoginRow[]> {
  const { User } = await getTenantModels(dbName);
  const list = await User.find()
    .select('username fullName role active mustChangePassword')
    .sort({ role: 1, createdAt: 1 })
    .lean();
  return list.map((u) => ({
    id: String(u._id),
    username: u.username,
    name: u.fullName || u.username,
    role: u.role === 'admin' ? 'admin' : 'user',
    active: u.active !== false,
    mustChangePassword: !!u.mustChangePassword,
  }));
}

export interface ChangeLoginInput {
  orgId: string;
  userId: string;
  /** Yangi login (bo'sh yoki o'zgarmagan — login tegilmaydi) */
  username?: string;
  /** Yangi parol (bo'sh — parol tegilmaydi), `generate` bo'lsa e'tiborsiz */
  password?: string;
  /** Vaqtinchalik parolni avtomatik yaratish */
  generate?: boolean;
  /** Keyingi kirishda parolni o'zi almashtirishi shart */
  mustChange?: boolean;
}

export interface ChangeLoginResult {
  slug: string;
  oldUsername: string;
  username: string;
  role: 'admin' | 'user';
  loginChanged: boolean;
  passwordChanged: boolean;
  /** Faqat avtomatik yaratilganda — bir marta ko'rsatish uchun */
  generatedPassword?: string;
}

export async function changeOrgLogin(input: ChangeLoginInput): Promise<ChangeLoginResult> {
  if (!isValidObjectId(input.orgId) || !isValidObjectId(input.userId)) throw new LoginChangeError('Login topilmadi.');
  const { Organization } = await getMasterModels();
  const org = await Organization.findById(input.orgId).select('slug dbName adminUsername').lean().catch(() => null);
  if (!org) throw new LoginChangeError("Do'kon topilmadi.");

  const { User } = await getTenantModels(org.dbName);
  const user = await User.findById(input.userId).exec();
  if (!user) throw new LoginChangeError('Login topilmadi.');

  const oldUsername = user.username;
  const nextUsername = input.username ? normalizeLoginInput(input.username) : oldUsername;
  const loginChanged = nextUsername !== oldUsername;

  let password = '';
  if (input.generate) password = generateTempPassword();
  else if (input.password) password = input.password;
  if (password && password.length < 6) throw new LoginChangeError("Parol kamida 6 ta belgidan iborat bo'lishi kerak.");
  if (password.length > 128) throw new LoginChangeError('Parol juda uzun.');
  const passwordChanged = !!password;

  if (!loginChanged && !passwordChanged) throw new LoginChangeError("O'zgarish yo'q: yangi login yoki parol kiriting.");

  const role: 'admin' | 'user' = user.role === 'admin' ? 'admin' : 'user';

  if (loginChanged) {
    if (!LOGIN_RE.test(nextUsername)) {
      throw new LoginChangeError("Login 3–40 belgi: kichik lotin harf, raqam, «_», «.» yoki «-» (boshida harf/raqam).");
    }
    if (await User.exists({ username: nextUsername, _id: { $ne: user._id } })) {
      throw new LoginChangeError(`«${nextUsername}» logini shu do'konda band.`);
    }
    // Avval yangi loginni global band qilamiz (atomik) — band bo'lsa hech narsa o'zgarmaydi
    try {
      await reserveUsername({
        username: nextUsername,
        organizationId: String(org._id),
        dbName: org.dbName,
        role,
        branchId: user.branchId ? String(user.branchId) : undefined,
      });
    } catch (err) {
      if (err instanceof UsernameTakenError) throw new LoginChangeError(err.message);
      throw err;
    }
    user.username = nextUsername;
  }

  if (passwordChanged) {
    user.password = password;
    user.mustChangePassword = input.generate ? true : !!input.mustChange;
    user.resetCodeHash = undefined;
    user.resetCodeExpiresAt = undefined;
    user.resetAttempts = undefined;
  }
  // Ochiq sessiyalar yopiladi (sessiyada login nomi saqlanadi — eski nom bilan qolmasin)
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;

  try {
    await user.save();
  } catch (err) {
    if (loginChanged) await releaseUsername(nextUsername).catch(() => {});
    throw err;
  }

  if (loginChanged) {
    await releaseUsername(oldUsername).catch(() => {});
    const set: Record<string, string> = { 'users.$[u].username': nextUsername };
    if (role === 'admin' && (!org.adminUsername || org.adminUsername === oldUsername)) set.adminUsername = nextUsername;
    await Organization.updateOne({ _id: org._id }, { $set: set }, { arrayFilters: [{ 'u.username': oldUsername }] }).catch(() => {});
  }

  return {
    slug: org.slug,
    oldUsername,
    username: user.username,
    role,
    loginChanged,
    passwordChanged,
    ...(input.generate ? { generatedPassword: password } : {}),
  };
}
