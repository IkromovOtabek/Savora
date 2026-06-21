import { getIronSession, IronSession, SessionOptions } from 'iron-session';
import { cookies, headers } from 'next/headers';

export type Role = 'super_admin' | 'admin' | 'user';
export type SessionKind = 'super' | 'tenant';

export interface SessionUser {
  id: string;
  username: string;
  role: Role;
  tokenVersion: number;
  organizationId?: string; // tenant userlar uchun
  dbName?: string;         // tenant userlar uchun — qaysi bazaga ulanish
  branchId?: string;       // filial login — qaysi filialga bog'langan (admin'da bo'lmaydi)
}

export interface SessionData {
  user?: SessionUser;
}

// Xavfsizlik: production'da SESSION_SECRET majburiy. Bo'lmasa — ishga tushmaydi
// (publik fallback bilan sessiya imzolansa, uni soxtalashtirish mumkin edi).
// Build fazasida (next build) tekshirmaymiz — faqat ishlash (runtime) vaqtida.
const SESSION_SECRET = process.env.SESSION_SECRET;
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
if (process.env.NODE_ENV === 'production' && !isBuildPhase && (!SESSION_SECRET || SESSION_SECRET.length < 32)) {
  throw new Error('SESSION_SECRET (kamida 32 belgi) .env da o\'rnatilishi shart.');
}

const COOKIE_BY_KIND: Record<SessionKind, string> = {
  super: 'savora_super',
  tenant: 'savora_tenant',
};

function optionsFor(kind: SessionKind): SessionOptions {
  return {
    // Dev uchun fallback; production'da yuqorida majburiy tekshiruv bor
    password: SESSION_SECRET || 'dev-only-session-secret-change-in-prod-32ch',
    cookieName: COOKIE_BY_KIND[kind],
    cookieOptions: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 8 * 60 * 60, // 8 soat
      sameSite: 'lax',
    },
  };
}

/** Zona (x-app-zone) bo'yicha qaysi sessiya cookie'si — super alohida, tenant alohida */
async function resolveKind(explicit?: SessionKind): Promise<SessionKind> {
  if (explicit) return explicit;
  try {
    const h = await headers();
    return h.get('x-app-zone') === 'super' ? 'super' : 'tenant';
  } catch {
    return 'tenant';
  }
}

/**
 * Sessiya. Super admin va tenant ALOHIDA cookie ishlatadi — shuning uchun bitta
 * brauzerda ikkalasiga bir vaqtda kirib turish mumkin (bir-birini chiqarmaydi).
 */
export async function getSession(kind?: SessionKind): Promise<IronSession<SessionData>> {
  const k = await resolveKind(kind);
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, optionsFor(k));
}
