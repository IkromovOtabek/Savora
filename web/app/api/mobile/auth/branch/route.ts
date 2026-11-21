import { NextResponse } from 'next/server';
import { isValidObjectId } from 'mongoose';
import { authenticateMobile, createMobileToken } from '@/lib/mobileAuth';
import { getMasterModels } from '@/lib/masterDb';
import { getTenantModels } from '@/lib/tenantDb';
import { isOrganizationActive } from '@/lib/models/master/Organization';
import { recordAudit } from '@/lib/audit';

/**
 * Biznes egasi parolsiz filialga kiradi (mobil, bosh sahifada do'kon nomi → filial).
 * POST { branchId } → { token, user, org, branch }: shu filialning ASOSIY logini (filial yaratilganda ochilgan,
 * xodim emas) uchun token. Ilova egasining tokenini o'zida saqlab qoladi va «Bosh hisobga qaytish»da tiklaydi.
 *
 * Xavfsizlik: faqat admin (egasi) va faqat o'z bazasidagi faol filial; xodim (staff) hisobiga kirilmaydi.
 * Har kirish audit jurnaliga yoziladi.
 */
export async function POST(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const owner = auth;
  if (!owner.dbName || !owner.organizationId) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  if (owner.role !== 'admin') return NextResponse.json({ error: 'Faqat biznes egasi filialga kira oladi.' }, { status: 403 });

  let body: { branchId?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Noto\'g\'ri so\'rov.' }, { status: 400 }); }
  const branchId = String(body.branchId ?? '');
  if (!isValidObjectId(branchId)) return NextResponse.json({ error: 'Filial topilmadi.' }, { status: 404 });

  const { Branch, User } = await getTenantModels(owner.dbName);
  const branch = await Branch.findOne({ _id: branchId, active: true }).lean();
  if (!branch) return NextResponse.json({ error: 'Filial topilmadi.' }, { status: 404 });
  if (branch.isMain) return NextResponse.json({ error: 'Bu bosh filial — o\'z hisobingizda ko\'rinadi.' }, { status: 400 });

  // Filialning asosiy logini: role 'user', xodim emas, eng birinchi ochilgani
  const target = await User.findOne({ branchId: branch._id, role: 'user', active: true, staff: { $ne: true } })
    .sort({ createdAt: 1 })
    .select('username role tokenVersion fullName')
    .lean();
  if (!target) return NextResponse.json({ error: 'Bu filialning faol logini yo\'q.' }, { status: 404 });

  const { Organization } = await getMasterModels();
  const org = await Organization.findById(owner.organizationId).select('name slug expiresAt status').lean();
  if (!org) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });

  const token = await createMobileToken({
    id: String(target._id),
    username: target.username,
    role: target.role,
    tokenVersion: target.tokenVersion ?? 0,
    organizationId: owner.organizationId,
    dbName: owner.dbName,
    branchId: String(branch._id),
  });

  await recordAudit(owner, {
    action: 'branch.enter',
    entity: 'branch',
    entityId: String(branch._id),
    summary: `Egasi filialga kirdi: ${branch.name} (login: ${target.username}) (mobil)`,
  });

  return NextResponse.json({
    token,
    user: { id: String(target._id), username: target.username, role: target.role, fullName: target.fullName ?? null, mustChangePassword: false },
    org: { name: org.name, slug: org.slug, expiresAt: org.expiresAt, active: isOrganizationActive(org) },
    branch: { id: String(branch._id), name: branch.name },
  });
}
