import { NextResponse } from 'next/server';
import { getMasterModels } from '@/lib/masterDb';
import { getTenantModels } from '@/lib/tenantDb';
import { isOrganizationActive } from '@/lib/models/master/Organization';
import { createMobileToken } from '@/lib/mobileAuth';
import { clearRateLimit, hitRateLimit } from '@/lib/rateLimit';
import { clientIpFrom, loginRateKeys } from '@/lib/security';
import { normalizeSlug } from '@/lib/slug';
import { lookupUser } from '@/lib/userDirectory';

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
  const rl = hitRateLimit(keys.user);
  const rlIp = hitRateLimit(keys.ip, 30);
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
  // Do'kon topilmasa ham login/parol xatosi — mavjudlikni oshkor qilmaymiz
  if (!org) return NextResponse.json({ error: 'Login yoki parol noto\'g\'ri.' }, { status: 401 });
  if (org.status === 'suspended') {
    return NextResponse.json({ error: 'Do\'kon to\'xtatilgan.' }, { status: 403 });
  }

  const { User } = await getTenantModels(org.dbName);
  const user = await User.findOne({ username }).exec();
  if (!user || !user.active || !(await user.comparePassword(password))) {
    return NextResponse.json({ error: 'Login yoki parol noto\'g\'ri.' }, { status: 401 });
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
  clearRateLimit(keys.user);
  const token = await createMobileToken(sessionUser);

  return NextResponse.json({
    token,
    user: { id: sessionUser.id, username: user.username, role: user.role, fullName: user.fullName ?? null },
    org: { name: org.name, slug: org.slug, expiresAt: org.expiresAt, active: isOrganizationActive(org) },
  });
}
