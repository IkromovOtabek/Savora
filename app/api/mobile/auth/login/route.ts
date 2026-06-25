import { NextResponse } from 'next/server';
import { getMasterModels } from '@/lib/masterDb';
import { getTenantModels } from '@/lib/tenantDb';
import { isOrganizationActive } from '@/lib/models/master/Organization';
import { createMobileToken } from '@/lib/mobileAuth';
import { hitRateLimit } from '@/lib/rateLimit';
import { normalizeSlug } from '@/lib/slug';

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
  if (!slug || !username || !password) {
    return NextResponse.json({ error: 'Do\'kon manzili, login va parol shart.' }, { status: 400 });
  }

  // Brute-force himoyasi
  const rl = hitRateLimit(`mobile:${slug}:${username}`);
  if (!rl.ok) {
    return NextResponse.json({ error: 'Juda ko\'p urinish. Birozdan so\'ng urinib ko\'ring.' }, { status: 429 });
  }

  const { Organization } = await getMasterModels();
  const org = await Organization.findOne({ slug }).lean();
  if (!org) return NextResponse.json({ error: 'Do\'kon topilmadi.' }, { status: 404 });
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
  const token = await createMobileToken(sessionUser);

  return NextResponse.json({
    token,
    user: { id: sessionUser.id, username: user.username, role: user.role, fullName: user.fullName ?? null },
    org: { name: org.name, slug: org.slug, expiresAt: org.expiresAt, active: isOrganizationActive(org) },
  });
}
