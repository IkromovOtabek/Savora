import { sealData, unsealData } from 'iron-session';
import type { SessionUser } from './session';
import { getMasterModels } from './masterDb';
import { getTenantModels } from './tenantDb';

/**
 * Mobil (native) ilova uchun stateless token.
 * iron-session'ning sealData/unsealData orqali — SESSION_SECRET bilan shifrlanadi.
 * Cookie emas; ilova `Authorization: Bearer <token>` sifatida yuboradi.
 */
const PASSWORD = process.env.SESSION_SECRET || 'dev-only-session-secret-change-in-prod-32ch';
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 kun

export async function createMobileToken(user: SessionUser): Promise<string> {
  return sealData(user, { password: PASSWORD, ttl: TTL_SECONDS });
}

/** Bearer token'ni o'qib, foydalanuvchini qaytaradi (tokenVersion tekshiruvi bilan) */
export async function verifyMobileToken(req: Request): Promise<SessionUser | null> {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;

  let user: SessionUser;
  try {
    user = await unsealData<SessionUser>(token, { password: PASSWORD, ttl: TTL_SECONDS });
  } catch {
    return null;
  }
  if (!user?.id || !user.role) return null;

  // tokenVersion — parol o'zgarsa eski token bekor bo'ladi
  try {
    if (user.role === 'super_admin') {
      const { SuperAdmin } = await getMasterModels();
      const sa = await SuperAdmin.findById(user.id).select('tokenVersion').lean();
      if (!sa || (sa.tokenVersion ?? 0) !== user.tokenVersion) return null;
    } else {
      if (!user.dbName) return null;
      const { User } = await getTenantModels(user.dbName);
      const u = await User.findById(user.id).select('tokenVersion active').lean();
      if (!u || !u.active || (u.tokenVersion ?? 0) !== user.tokenVersion) return null;
    }
  } catch {
    return null;
  }

  return user;
}
