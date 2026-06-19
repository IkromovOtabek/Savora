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

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || 'savdopro-session-secret-change-this-32chars',
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
