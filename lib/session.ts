import { getIronSession, IronSession, SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

export type Role = 'super_admin' | 'admin' | 'user';

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
const SESSION_SECRET = process.env.SESSION_SECRET;
if (process.env.NODE_ENV === 'production' && (!SESSION_SECRET || SESSION_SECRET.length < 32)) {
  throw new Error('SESSION_SECRET (kamida 32 belgi) .env da o\'rnatilishi shart.');
}

export const sessionOptions: SessionOptions = {
  // Dev uchun fallback; production'da yuqorida majburiy tekshiruv bor
  password: SESSION_SECRET || 'dev-only-session-secret-change-in-prod-32ch',
  cookieName: 'savdopro_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 8 * 60 * 60, // 8 soat
    sameSite: 'lax',
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}
