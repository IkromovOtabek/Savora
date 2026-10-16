import { NextResponse } from 'next/server';
import { validateInitData } from '@/lib/telegramAuth';
import { getMasterModels } from '@/lib/masterDb';
import { getTenantModels } from '@/lib/tenantDb';
import { getSession } from '@/lib/session';
import { setRouteCookies } from '@/lib/routeCookies';
import { cookies } from 'next/headers';
import { hitRateLimit } from '@/lib/rateLimit';
import { clientIpFrom, loginRateKeys } from '@/lib/security';

/**
 * Telegram Mini App kirish: client initData yuboradi → tekshiramiz →
 * bog'langan Savora user topilsa, tenant sessiyasini ochamiz va /app ga yo'naltiramiz.
 * Bog'lanmagan bo'lsa { needLink: true } qaytaramiz (Kabinetda ulash kerak).
 */
export async function POST(req: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Bot sozlanmagan.' }, { status: 503 });
  }

  // IP bo'yicha cheklov (30/15 daq) — initData'ni qayta-qayta sinab ko'rishga qarshi
  const rlIp = hitRateLimit(loginRateKeys('tgauth', clientIpFrom(req.headers), 'tgauth').ip, 30);
  if (!rlIp.ok) {
    const retryAfter = rlIp.retryAfterSec ?? 0;
    return NextResponse.json(
      { ok: false, error: "Juda ko'p urinish. Birozdan so'ng qayta urinib ko'ring.", retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  let initData = '';
  try {
    const body = await req.json();
    initData = String(body?.initData || '');
  } catch {
    return NextResponse.json({ ok: false, error: "Noto'g'ri so'rov." }, { status: 400 });
  }

  const tgUser = validateInitData(initData, token);
  if (!tgUser) {
    return NextResponse.json({ ok: false, error: "Telegram ma'lumoti tasdiqlanmadi." }, { status: 401 });
  }

  const { TelegramAccount, Organization } = await getMasterModels();
  const link = await TelegramAccount.findOne({ telegramUserId: String(tgUser.id) }).lean();
  if (!link) {
    return NextResponse.json({ ok: false, needLink: true });
  }

  const org = await Organization.findById(link.organizationId).lean();
  if (!org || org.status === 'suspended') {
    return NextResponse.json({ ok: false, error: "Do'kon mavjud emas yoki to'xtatilgan." }, { status: 403 });
  }

  const { User } = await getTenantModels(link.dbName);
  const user = await User.findById(link.userId).exec();
  if (!user || !user.active) {
    return NextResponse.json({ ok: false, error: 'Foydalanuvchi faol emas.' }, { status: 403 });
  }

  const session = await getSession('tenant');
  session.user = {
    id: String(user._id),
    username: user.username,
    role: user.role,
    tokenVersion: user.tokenVersion ?? 0,
    organizationId: String(org._id),
    dbName: link.dbName,
    branchId: user.branchId ? String(user.branchId) : undefined,
  };
  await session.save();
  await setRouteCookies('tenant', org.slug);

  // Mini App belgisi — layout shu cookie bo'yicha soat/ortiqcha elementlarni yashiradi
  (await cookies()).set('savora_tgapp', '1', {
    path: '/', httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60,
  });

  return NextResponse.json({ ok: true, next: '/app' });
}
