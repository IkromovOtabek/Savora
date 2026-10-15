import { sealData, unsealData } from 'iron-session';
import { NextResponse } from 'next/server';
import type { SessionUser } from './session';
import { getMasterModels } from './masterDb';
import { getTenantModels } from './tenantDb';
import { isOrganizationActive } from './models/master/Organization';

/**
 * Mobil (native) ilova uchun stateless token.
 * iron-session'ning sealData/unsealData orqali — SESSION_SECRET bilan shifrlanadi.
 * Cookie emas; ilova `Authorization: Bearer <token>` sifatida yuboradi.
 */
const SESSION_SECRET = process.env.SESSION_SECRET;
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
// Xavfsizlik: production'da SESSION_SECRET majburiy (publik fallback bilan token soxtalashtirilardi)
if (process.env.NODE_ENV === 'production' && !isBuildPhase && (!SESSION_SECRET || SESSION_SECRET.length < 32)) {
  throw new Error('SESSION_SECRET (kamida 32 belgi) .env da o\'rnatilishi shart.');
}
const PASSWORD = SESSION_SECRET || 'dev-only-session-secret-change-in-prod-32ch';
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 kun

/** Ma'lumot o'zgartirmaydigan HTTP metodlar (muddati tugagan do'kon uchun ruxsat) */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

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

/**
 * Mobil endpointlar uchun to'liq tekshiruv: token + do'kon holati.
 *  - token yo'q/yaroqsiz → 401
 *  - do'kon topilmadi yoki dbName mos emas → 401
 *  - do'kon to'xtatilgan (suspended) → 403
 *  - muddati tugagan → faqat o'qish (GET); yozish so'rovlari → 402
 * Natija `NextResponse` bo'lsa — uni qaytaring.
 */
export async function authenticateMobile(req: Request): Promise<SessionUser | NextResponse> {
  const user = await verifyMobileToken(req);
  if (!user) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  if (user.role === 'super_admin') return user;

  try {
    if (!user.organizationId) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
    const { Organization } = await getMasterModels();
    const org = await Organization.findById(user.organizationId)
      .select('status expiresAt dbName plan')
      .lean();
    if (!org || org.dbName !== user.dbName) {
      return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
    }
    if (org.status === 'suspended') {
      return NextResponse.json(
        { error: 'Do\'kon to\'xtatilgan. Platforma egasiga murojaat qiling.', code: 'ORG_SUSPENDED' },
        { status: 403 }
      );
    }
    if (!isOrganizationActive(org) && !READ_METHODS.has(req.method.toUpperCase())) {
      return NextResponse.json(
        { error: 'Obuna muddati tugagan. Davom etish uchun to\'lovni amalga oshiring.', code: 'ORG_EXPIRED' },
        { status: 402 }
      );
    }
  } catch {
    return NextResponse.json({ error: 'Server xatosi.' }, { status: 500 });
  }

  return user;
}
