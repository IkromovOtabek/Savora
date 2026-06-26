import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getMasterModels } from '@/lib/masterDb';
import { getTenantModels } from '@/lib/tenantDb';
import { getSession } from '@/lib/session';
import { setRouteCookies } from '@/lib/routeCookies';
import { validateInitData } from '@/lib/telegramAuth';
import { hitRateLimit } from '@/lib/rateLimit';
import { normalizeSlug } from '@/lib/slug';

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

  const rl = hitRateLimit(`tglogin:${slug}:${username}`);
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "Juda ko'p urinish. Birozdan so'ng urinib ko'ring." }, { status: 429 });
  }

  const { Organization, TelegramAccount } = await getMasterModels();
  const org = await Organization.findOne({ slug }).lean();
  if (!org) return NextResponse.json({ ok: false, error: "Do'kon topilmadi." }, { status: 404 });
  if (org.status === 'suspended') {
    return NextResponse.json({ ok: false, error: "Do'kon to'xtatilgan." }, { status: 403 });
  }

  const { User } = await getTenantModels(org.dbName);
  const user = await User.findOne({ username }).exec();
  if (!user || !user.active || !(await user.comparePassword(password))) {
    return NextResponse.json({ ok: false, error: "Login yoki parol noto'g'ri." }, { status: 401 });
  }

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
