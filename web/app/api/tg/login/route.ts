import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getMasterModels } from '@/lib/masterDb';
import { getTenantModels } from '@/lib/tenantDb';
import { getSession } from '@/lib/session';
import { setRouteCookies } from '@/lib/routeCookies';
import { validateInitData } from '@/lib/telegramAuth';
import { hitRateLimit } from '@/lib/rateLimit';
import { normalizeSlug } from '@/lib/slug';
import { clientIpFrom, loginRateKeys } from '@/lib/security';
import { recordSecurityEvent, requestMeta } from '@/lib/securityEvents';

/**
 * Mini App brauzer ichida ochilsa `Origin` bizning host (yoki telegram.org) bo'ladi.
 * Boshqa saytdan yuborilgan so'rov (CSRF/credential-stuffing skripti) rad etiladi.
 * `Origin` yo'q bo'lsa (ba'zi Telegram klientlari yubormaydi) — o'tkaziladi.
 */
function originAllowed(h: Headers): boolean {
  const origin = h.get('origin');
  if (!origin) return true;
  let host: string;
  try {
    host = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const ownHost = (h.get('x-forwarded-host') || h.get('host') || '').split(',')[0].trim().toLowerCase();
  if (ownHost && host === ownHost) return true;
  return host === 'telegram.org' || host.endsWith('.telegram.org');
}

/**
 * Telegram Mini App ichida login/parol bilan kirish. Muvaffaqiyatda tenant
 * sessiyasi ochiladi VA Telegram hisobi shu userga bog'lanadi (keyingi safar
 * avtomatik kirish uchun).
 */
export async function POST(req: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  let body: { initData?: string; slug?: string; username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Noto'g'ri so'rov." }, { status: 400 });
  }

  const slug = normalizeSlug(String(body.slug || ''));
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!slug || !username || !password) {
    return NextResponse.json({ ok: false, error: "Do'kon manzili, login va parol shart." }, { status: 400 });
  }

  if (!originAllowed(req.headers)) {
    recordSecurityEvent('tg_login_fail', { username, ...requestMeta(req.headers), zone: 'tg', slug, note: 'origin rad etildi' });
    return NextResponse.json({ ok: false, error: "So'rov manbai ruxsat etilmagan." }, { status: 403 });
  }

  // Brute-force himoyasi: login bo'yicha (6/15 daq) + IP bo'yicha (20/15 daq — ko'p loginni sinab ko'rish)
  const rl = hitRateLimit(`tglogin:${slug}:${username}`);
  const rlIp = hitRateLimit(loginRateKeys(username, clientIpFrom(req.headers), 'tglogin').ip, 20);
  if (!rl.ok || !rlIp.ok) {
    const retryAfter = Math.max(rl.retryAfterSec ?? 0, rlIp.retryAfterSec ?? 0);
    const min = Math.ceil(retryAfter / 60);
    recordSecurityEvent('login_blocked', { username, ...requestMeta(req.headers), zone: 'tg', slug });
    return NextResponse.json(
      { ok: false, error: `Juda ko'p urinish. ${min} daqiqadan so'ng qayta urinib ko'ring.`, retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  const { Organization, TelegramAccount } = await getMasterModels();
  const org = await Organization.findOne({ slug }).lean();
  // Noma'lum slug ham, noto'g'ri parol ham bir xil javob — do'kon mavjudligini aniqlab bo'lmaydi
  const GENERIC_FAIL = NextResponse.json({ ok: false, error: "Login yoki parol noto'g'ri." }, { status: 401 });
  if (!org) {
    recordSecurityEvent('tg_login_fail', { username, ...requestMeta(req.headers), zone: 'tg', slug });
    return GENERIC_FAIL;
  }

  const { User } = await getTenantModels(org.dbName);
  const user = await User.findOne({ username }).exec();
  if (!user || !user.active || !(await user.comparePassword(password))) {
    recordSecurityEvent('tg_login_fail', { username, ...requestMeta(req.headers), zone: 'tg', slug });
    return GENERIC_FAIL;
  }
  // Do'kon holati faqat parol tasdiqlangach aytiladi
  if (org.status === 'suspended') {
    return NextResponse.json({ ok: false, error: "Do'kon to'xtatilgan." }, { status: 403 });
  }
  recordSecurityEvent('login_ok', { username, ...requestMeta(req.headers), zone: 'tg', slug });

  // Sessiya
  const session = await getSession('tenant');
  session.user = {
    id: String(user._id),
    username: user.username,
    role: user.role,
    tokenVersion: user.tokenVersion ?? 0,
    organizationId: String(org._id),
    dbName: org.dbName,
    branchId: user.branchId ? String(user.branchId) : undefined,
  };
  await session.save();
  await setRouteCookies('tenant', org.slug);

  // Telegram hisobini bog'lash (keyingi safar avtomatik)
  const tgUser = token ? validateInitData(String(body.initData || ''), token) : null;
  if (tgUser) {
    await TelegramAccount.updateMany(
      { telegramUserId: String(tgUser.id) },
      { $unset: { telegramUserId: '' } }
    );
    await TelegramAccount.findOneAndUpdate(
      { dbName: org.dbName, userId: String(user._id) },
      {
        $set: {
          telegramUserId: String(tgUser.id),
          organizationId: org._id,
          orgSlug: org.slug,
          username: user.username,
          linkedAt: new Date(),
        },
        $unset: { code: '', codeExpiresAt: '' },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    (await cookies()).set('savora_tgapp', '1', {
      path: '/', httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60,
    });
  }

  return NextResponse.json({ ok: true, next: '/app' });
}
