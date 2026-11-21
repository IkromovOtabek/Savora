import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { getIronSession, sealData, unsealData, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import { getMasterModels } from '../masterDb';
import { unlocked } from '../models/master/MarketOrder';
import { hitRateLimit, clearRateLimit } from '../rateLimit';
import { buyerPhoneKey } from './group';

/**
 * E-commerce xaridori sessiyasi — do'kon (tenant) va super sessiyalaridan ALOHIDA:
 *  - web: `savora_buyer` cookie (iron-session, 30 kun);
 *  - mobil: `Authorization: Bearer <token>` (sealData; payload'da kind: 'buyer' — do'kon tokeni bilan adashmaydi).
 * Har so'rovda xaridor bazadan tekshiriladi (faol + tokenVersion) — parol almashsa eski sessiyalar bekor.
 */

const SECRET = process.env.SESSION_SECRET || 'dev-only-session-secret-change-in-prod-32ch';
const TTL = 30 * 24 * 60 * 60;
export const BUYER_COOKIE = 'savora_buyer';
export const BUYER_PASSWORD_MIN = 6;

interface BuyerSeal { kind: 'buyer'; id: string; tv: number }
interface BuyerSessionData { buyer?: BuyerSeal }

export interface BuyerInfo { id: string; name: string; phone: string; address?: string }

function cookieOptions(): SessionOptions {
  return {
    password: SECRET,
    cookieName: BUYER_COOKIE,
    ttl: TTL,
    cookieOptions: { secure: process.env.NODE_ENV === 'production', httpOnly: true, sameSite: 'lax', maxAge: TTL - 60, path: '/' },
  };
}

async function buyerSession() {
  return getIronSession<BuyerSessionData>(await cookies(), cookieOptions());
}

async function loadBuyer(seal: BuyerSeal | undefined): Promise<BuyerInfo | null> {
  if (!seal || seal.kind !== 'buyer' || !Types.ObjectId.isValid(seal.id)) return null;
  const { Buyer } = await getMasterModels();
  const b = await Buyer.findById(seal.id).select('name phone address tokenVersion active').lean();
  if (!b || !b.active || (b.tokenVersion ?? 0) !== seal.tv) return null;
  return { id: String(b._id), name: b.name, phone: b.phone, address: b.address };
}

/** Web: joriy xaridor (server komponent / action) */
export async function getBuyer(): Promise<BuyerInfo | null> {
  try {
    const s = await buyerSession();
    return await loadBuyer(s.buyer);
  } catch {
    return null;
  }
}

export async function setBuyerCookie(b: { _id: unknown; tokenVersion?: number }): Promise<void> {
  const s = await buyerSession();
  s.buyer = { kind: 'buyer', id: String(b._id), tv: b.tokenVersion ?? 0 };
  await s.save();
}

export async function clearBuyerCookie(): Promise<void> {
  const s = await buyerSession();
  s.destroy();
}

export async function createBuyerToken(b: { _id: unknown; tokenVersion?: number }): Promise<string> {
  return sealData({ kind: 'buyer', id: String(b._id), tv: b.tokenVersion ?? 0 } satisfies BuyerSeal, { password: SECRET, ttl: TTL });
}

/** API: Bearer token (mobil) yoki cookie (web) */
export async function getBuyerFromRequest(req: Request): Promise<BuyerInfo | null> {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (token) {
    try {
      const seal = await unsealData<BuyerSeal>(token, { password: SECRET, ttl: TTL });
      return await loadBuyer(seal);
    } catch {
      return null;
    }
  }
  return getBuyer();
}

export type BuyerAuthError = 'badPhone' | 'badName' | 'badPassword' | 'exists' | 'invalid' | 'rateLimited' | 'blocked';
export type BuyerAuthResult =
  | { ok: true; buyer: { _id: Types.ObjectId; name: string; phone: string; tokenVersion: number; address?: string } }
  | { ok: false; error: BuyerAuthError };

/** `telegramUserId` — chipta (lib/tgSignup.ts) route'da tekshirilgan bo'lsa; telefon o'sha chiptadagi raqam */
export async function registerBuyer(
  input: { name: unknown; phone: unknown; password: unknown; telegramUserId?: string },
  ip: string,
): Promise<BuyerAuthResult> {
  const rl = await hitRateLimit(`buyer-reg-ip:${ip}`, 10, 60 * 60_000);
  if (!rl.ok) return { ok: false, error: 'rateLimited' };
  const name = String(input.name ?? '').trim().replace(/\s+/g, ' ');
  const phone = buyerPhoneKey(input.phone);
  const password = String(input.password ?? '');
  if (name.length < 2 || name.length > 80) return { ok: false, error: 'badName' };
  if (!phone) return { ok: false, error: 'badPhone' };
  if (password.length < BUYER_PASSWORD_MIN || password.length > 100) return { ok: false, error: 'badPassword' };

  const { Buyer } = await getMasterModels();
  if (await Buyer.exists({ phone })) return { ok: false, error: 'exists' };
  try {
    const b = await Buyer.create({
      name, phone, password: await bcrypt.hash(password, 10), lastLoginAt: new Date(),
      ...(input.telegramUserId ? { telegramUserId: input.telegramUserId } : {}),
    });
    return { ok: true, buyer: { _id: b._id, name: b.name, phone: b.phone, tokenVersion: b.tokenVersion ?? 0 } };
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) return { ok: false, error: 'exists' };
    throw e;
  }
}

export async function loginBuyer(input: { phone: unknown; password: unknown }, ip: string): Promise<BuyerAuthResult> {
  const phone = buyerPhoneKey(input.phone);
  const password = String(input.password ?? '');
  const ipRl = await hitRateLimit(`buyer-login-ip:${ip}`, 30);
  if (!ipRl.ok) return { ok: false, error: 'rateLimited' };
  if (!phone || !password) return { ok: false, error: 'invalid' };
  const key = `buyer-login:${phone}`;
  const rl = await hitRateLimit(key);
  if (!rl.ok) return { ok: false, error: 'rateLimited' };

  const { Buyer } = await getMasterModels();
  const b = await Buyer.findOne({ phone }).select('name phone password tokenVersion active address').lean();
  if (!b || !(await bcrypt.compare(password, b.password))) return { ok: false, error: 'invalid' };
  if (!b.active) return { ok: false, error: 'blocked' };
  await clearRateLimit(key);
  await Buyer.updateOne({ _id: b._id }, { $set: { lastLoginAt: new Date() } });
  return { ok: true, buyer: { _id: b._id, name: b.name, phone: b.phone, tokenVersion: b.tokenVersion ?? 0, address: b.address } };
}

/** O'chirilgan xaridor buyurtmalarida ism/telefon o'rniga yoziladi */
export const DELETED_BUYER_NAME = "O'chirilgan xaridor";

export type BuyerDeleteError = 'badPassword' | 'activeOrders' | 'rateLimited' | 'notFound';

/**
 * Xaridor hisobini o'chirish (App Store 5.1.1(v)) — parol bilan tasdiqlanadi.
 * Do'kon qabul qilgan («accepted») buyurtma bo'lsa rad etiladi: do'konga yetkazish uchun telefon kerak.
 * «Yangi» buyurtmalar bekor qilinadi, qolgan buyurtmalarda ism/telefon/manzil yashiriladi, akkaunt butunlay o'chadi
 * (telefon bo'shaydi — qayta ro'yxatdan o'tish mumkin). Do'kon sotuvlari (tenant) — biznes hujjati, tegilmaydi.
 */
export async function deleteBuyerAccount(buyerId: string, password: unknown): Promise<{ ok: true } | { ok: false; error: BuyerDeleteError }> {
  if (!Types.ObjectId.isValid(buyerId)) return { ok: false, error: 'notFound' };
  const rl = await hitRateLimit(`buyer-delete:${buyerId}`, 5, 60 * 60_000);
  if (!rl.ok) return { ok: false, error: 'rateLimited' };

  const { Buyer, MarketOrder } = await getMasterModels();
  const b = await Buyer.findById(buyerId).select('password').lean();
  if (!b) return { ok: false, error: 'notFound' };
  const pass = typeof password === 'string' ? password : '';
  if (!pass || pass.length > 100 || !(await bcrypt.compare(pass, b.password))) return { ok: false, error: 'badPassword' };
  // Qabul qilingan yoki do'kon hozir yakunlayotgan (qulf) buyurtma — o'chirib bo'lmaydi
  const busy = await MarketOrder.exists({ buyerId: b._id, $or: [{ status: 'accepted' }, { status: 'new', $nor: [unlocked()] }] });
  if (busy) return { ok: false, error: 'activeOrders' };

  await MarketOrder.updateMany(
    { buyerId: b._id, status: 'new', ...unlocked() },
    { $set: { status: 'cancelled' }, $push: { history: { status: 'cancelled', at: new Date(), by: 'xaridor' } } },
  );
  // Shu orada do'kon qabul qilgan buyurtma bo'lsa — uning aloqa ma'lumoti yetkazish uchun qoladi
  await MarketOrder.updateMany(
    { buyerId: b._id, status: { $ne: 'accepted' } },
    { $set: { buyerName: DELETED_BUYER_NAME, buyerPhone: '—' }, $unset: { address: 1, note: 1 } },
  );
  await Buyer.deleteOne({ _id: b._id });
  return { ok: true };
}
