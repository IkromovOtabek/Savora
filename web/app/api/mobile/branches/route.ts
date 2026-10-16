import { NextResponse } from 'next/server';
import { authenticateMobile } from '@/lib/mobileAuth';
import { mobilePermissionDenied } from '@/lib/permissionGuard';
import { recordAudit } from '@/lib/audit';
import { getTenantModels } from '@/lib/tenantDb';
import { reserveUsername, isUsernameAvailable, UsernameTakenError } from '@/lib/userDirectory';
import { addOrgUser } from '@/lib/orgUsers';

const normalizeLogin = (v: string) => v.trim().toLowerCase().replace(/\s+/g, '');

/** Matn maydonlari uzunlik chegarasi — oshsa 400 (xotira/DB to'ldirish himoyasi) */
const MAX_LEN = { name: 80, address: 200, phone: 20, username: 32 } as const;
const tooLong = (v: string, max: number) => v.length > max;

/** Filiallar ro'yxati. */
export async function GET(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  const { Branch } = await getTenantModels(user.dbName);
  const branches = await Branch.find({ active: true }).sort({ isMain: -1, name: 1 }).lean();
  return NextResponse.json({
    items: branches.map((b) => ({ id: String(b._id), name: b.name, address: b.address ?? null, isMain: !!b.isMain })),
  });
}

/** Yangi filial + login. Faqat biznes egasi (admin). createFilialAction mantiqi. */
export async function POST(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName || !user.organizationId) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Faqat biznes egasi filial qo\'sha oladi.' }, { status: 403 });
  { const denied = await mobilePermissionDenied(user, 'users.manage'); if (denied) return denied; }

  let body: { name?: string; address?: string; phone?: string; username?: string; password?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Noto\'g\'ri so\'rov.' }, { status: 400 }); }

  const name = String(body.name || '').trim();
  const address = String(body.address || '').trim();
  const phone = String(body.phone || '').trim();
  const username = normalizeLogin(String(body.username || ''));
  const password = String(body.password || '');

  if (!name) return NextResponse.json({ error: 'Filial nomi shart.' }, { status: 400 });
  if (tooLong(name, MAX_LEN.name) || tooLong(address, MAX_LEN.address) || tooLong(phone, MAX_LEN.phone) || tooLong(username, MAX_LEN.username)) {
    return NextResponse.json({ error: 'Matn maydoni juda uzun.' }, { status: 400 });
  }
  if (username.length < 3) return NextResponse.json({ error: 'Login kamida 3 belgi.' }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: 'Parol kamida 6 belgi.' }, { status: 400 });

  const { User, Branch } = await getTenantModels(user.dbName);
  if (await User.findOne({ username }).lean()) return NextResponse.json({ error: 'Bu login allaqachon band.' }, { status: 409 });
  if (!(await isUsernameAvailable(username))) return NextResponse.json({ error: 'Bu login boshqa do\'konda band.' }, { status: 409 });

  const branch = await Branch.create({ name, address: address || undefined, phone: phone || undefined, active: true });
  const u = new User({ username, password, role: 'user', fullName: name, branchId: branch._id, active: true, mustChangePassword: false });
  await u.save();
  try {
    await reserveUsername({ username, organizationId: user.organizationId, dbName: user.dbName, role: 'user', branchId: String(branch._id) });
  } catch (e) {
    await User.deleteOne({ _id: u._id });
    await Branch.findByIdAndDelete(branch._id);
    return NextResponse.json({ error: e instanceof UsernameTakenError ? e.message : 'Filial yaratishda xatolik.' }, { status: 409 });
  }
  await addOrgUser(user.organizationId, { username, name, role: 'user', branchId: String(branch._id) });
  await recordAudit(user, {
    action: 'branch.create',
    entity: 'branch',
    entityId: String(branch._id),
    summary: `Filial yaratildi: ${name} (login: ${username}) (mobil)`,
  });

  return NextResponse.json({ id: String(branch._id), name: branch.name, login: username }, { status: 201 });
}
