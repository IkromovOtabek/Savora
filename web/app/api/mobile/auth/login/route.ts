import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getMasterModels } from '@/lib/masterDb';
import { getTenantModels } from '@/lib/tenantDb';
import { isOrganizationActive } from '@/lib/models/master/Organization';
import { createMobileToken } from '@/lib/mobileAuth';
import { clearRateLimit, hitRateLimit } from '@/lib/rateLimit';
import { clientIpFrom, loginRateKeys } from '@/lib/security';
import { normalizeSlug } from '@/lib/slug';
import { lookupUser } from '@/lib/userDirectory';

/**
 * Foydalanuvchi topilmaganda ham bcrypt.compare bajariladi — javob vaqti bo'yicha
 * login mavjudligini aniqlab bo'lmasin. Oldindan hisoblangan tasodifiy hash (cost 10).
 */
const DUMMY_HASH = '$2a$10$xJiivtZBCMlpoiXARiqiFus5yCCfDyy7iN0Pg045SDbdgfsEUPQt2';

export async function POST(req: Request) {
  let body: { slug?: string; username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto\'g\'ri so\'rov.' }, { status: 400 });
  }

  const slug = normalizeSlug(String(body.slug || ''));
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!username || !password) {
    return NextResponse.json({ error: 'Login va parol shart.' }, { status: 400 });
  }

  // Brute-force himoyasi — slug kalitga kirmaydi (almashtirib chetlab o'tib bo'lmaydi)
  const keys = loginRateKeys(username, clientIpFrom(req.headers));
  const rl = await hitRateLimit(keys.user);
  const rlIp = await hitRateLimit(keys.ip, 30);
  if (!rl.ok || !rlIp.ok) {
    return NextResponse.json({ error: 'Juda ko\'p urinish. Birozdan so\'ng urinib ko\'ring.' }, { status: 429 });
  }

  // Slug'siz kirish — username global registrdan do'konni topadi; slug berilsa undan
  const { Organization } = await getMasterModels();
  const org = slug
    ? await Organization.findOne({ slug }).lean()
    : await (async () => {
        const dir = await lookupUser(username);
        return dir ? Organization.findById(dir.organizationId).lean() : null;
      })();
  // Do'kon topilmasa ham login/parol xatosi — mavjudlikni oshkor qilmaymiz (vaqtni tenglashtirib)
  if (!org) {
    await bcrypt.compare(password, DUMMY_HASH);
    return NextResponse.json({ error: 'Login yoki parol noto\'g\'ri.' }, { status: 401 });
  }

  const { User } = await getTenantModels(org.dbName);
  const user = await User.findOne({ username }).exec();
  // Topilmasa ham compare bajariladi — vaqt farqi bo'yicha login mavjudligi sizmasin
  const passwordOk = user ? await user.comparePassword(password) : await bcrypt.compare(password, DUMMY_HASH);
  if (!user || !user.active || !passwordOk) {
    return NextResponse.json({ error: 'Login yoki parol noto\'g\'ri.' }, { status: 401 });
  }
  // To'xtatilgan do'kon — faqat parol tasdiqlangandan keyin aytiladi (begona odamga holat sizmasin)
  if (org.status === 'suspended') {
    return NextResponse.json({ error: 'Do\'kon to\'xtatilgan.' }, { status: 403 });
  }

  const sessionUser = {
    id: String(user._id),
    username: user.username,
    role: user.role,
    tokenVersion: user.tokenVersion ?? 0,
    organizationId: String(org._id),
    dbName: org.dbName,
    branchId: user.branchId ? String(user.branchId) : undefined,
  };
  await clearRateLimit(keys.user);
  const token = await createMobileToken(sessionUser);

  return NextResponse.json({
    token,
    user: { id: sessionUser.id, username: user.username, role: user.role, fullName: user.fullName ?? null, mustChangePassword: !!user.mustChangePassword },
    org: { name: org.name, slug: org.slug, expiresAt: org.expiresAt, active: isOrganizationActive(org) },
  });
}
