import { getMasterModels } from './masterDb';
import { IUserDirectory } from './models/master/UserDirectory';

/** Login band bo'lsa (global) — foydalanuvchiga ko'rsatiladigan aniq xato. */
export class UsernameTakenError extends Error {
  constructor(username: string) {
    super(`«${username}» logini allaqachon band. Boshqa login tanlang.`);
    this.name = 'UsernameTakenError';
  }
}

/** MongoDB duplicate-key (unique indeks buzilishi). */
function isDupKeyError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: number }).code === 11000;
}

function normalize(username: string): string {
  return username.trim().toLowerCase();
}

export interface DirectoryEntryInput {
  username: string;
  organizationId: string;
  dbName: string;
  role: 'admin' | 'user';
  branchId?: string;
}

/**
 * Username'ni global band qiladi (atomik — unique indeks orqali).
 * Band bo'lsa `UsernameTakenError` tashlanadi; boshqa xatolar qayta tashlanadi.
 */
export async function reserveUsername(entry: DirectoryEntryInput): Promise<void> {
  const { UserDirectory } = await getMasterModels();
  try {
    await UserDirectory.create({
      username: normalize(entry.username),
      organizationId: entry.organizationId,
      dbName: entry.dbName,
      role: entry.role,
      branchId: entry.branchId,
    });
  } catch (err) {
    if (isDupKeyError(err)) throw new UsernameTakenError(entry.username);
    throw err;
  }
}

/** Registrdan bitta login yozuvini o'chiradi (foydalanuvchi o'chirilganda). */
export async function releaseUsername(username: string): Promise<void> {
  if (!username) return;
  const { UserDirectory } = await getMasterModels();
  await UserDirectory.deleteOne({ username: normalize(username) });
}

/** Do'konga tegishli barcha login yozuvlarini o'chiradi (do'kon o'chirilganda). */
export async function releaseUsernamesForOrg(organizationId: string): Promise<void> {
  if (!organizationId) return;
  const { UserDirectory } = await getMasterModels();
  await UserDirectory.deleteMany({ organizationId });
}

export interface DirectoryLookup {
  username: string;
  organizationId: string;
  dbName: string;
  role: 'admin' | 'user';
  branchId?: string;
}

/** Login uchun: username -> qaysi do'kon. Topilmasa null. */
export async function lookupUser(username: string): Promise<DirectoryLookup | null> {
  if (!username) return null;
  const { UserDirectory } = await getMasterModels();
  const doc = (await UserDirectory.findOne({ username: normalize(username) }).lean()) as IUserDirectory | null;
  if (!doc) return null;
  return {
    username: doc.username,
    organizationId: String(doc.organizationId),
    dbName: doc.dbName,
    role: doc.role,
    branchId: doc.branchId,
  };
}

/**
 * Yaratishdan oldin tez tekshiruv (UX uchun). Asosiy kafolat baribir unique indeks —
 * poyga (race) holatida `reserveUsername` baribir bloklaydi.
 */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  const u = normalize(username);
  if (!u) return false;
  const { UserDirectory } = await getMasterModels();
  const existing = await UserDirectory.exists({ username: u });
  return !existing;
}
