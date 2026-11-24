import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateMobile } from '@/lib/mobileAuth';
import { mobilePermissionDenied } from '@/lib/permissionGuard';
import { getTenantModels } from '@/lib/tenantDb';
import { getMobileFeatures } from '@/lib/mobileOrg';
import { recordAudit } from '@/lib/audit';
import { escapeRegExp } from '@/lib/security';
import { readJsonInput, zReqText } from '@/lib/validation';

/**
 * Bank krediti uchun banklar (Kredit kassa ro'yxati) — mobil sotuv formasi shu ro'yxatdan tanlaydi.
 * GET — faol banklar (sale.create + creditKassa moduli); `canAdd` — do'kon egasi «+ Yangi bank» bilan qo'sha oladi.
 * POST { name } — faqat egasi (web quickCreditBankAction bilan bir xil: nom takrorlansa — o'sha bank, nofaol bo'lsa yoqiladi).
 */
export async function GET(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  { const denied = await mobilePermissionDenied(user, 'sale.create'); if (denied) return denied; }
  const features = await getMobileFeatures(user.organizationId);
  if (!features?.creditKassa) return NextResponse.json({ error: 'Kredit kassa moduli yoqilmagan.' }, { status: 403 });

  const { CreditBank } = await getTenantModels(user.dbName);
  const banks = await CreditBank.find({ active: true }).select('name').sort({ name: 1 }).limit(200).lean();
  return NextResponse.json({ banks: banks.map((b) => b.name), canAdd: user.role === 'admin' });
}

export async function POST(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Faqat biznes egasi uchun.' }, { status: 403 });
  const features = await getMobileFeatures(user.organizationId);
  if (!features?.creditKassa) return NextResponse.json({ error: 'Kredit kassa moduli yoqilmagan.' }, { status: 403 });

  const input = await readJsonInput(req, z.object({
    name: zReqText(80, 'Bank nomini kiriting.', 'Bank nomi juda uzun.'),
  }), { badJson: 'Noto\'g\'ri so\'rov.', fallback: 'Noto\'g\'ri so\'rov.' });
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });
  const { name } = input.data;

  const { CreditBank } = await getTenantModels(user.dbName);
  const dup = await CreditBank.findOne({ name: new RegExp(`^${escapeRegExp(name)}$`, 'i') }).lean();
  if (dup) {
    if (!dup.active) await CreditBank.updateOne({ _id: dup._id }, { $set: { active: true } });
    return NextResponse.json({ name: dup.name }, { status: 200 });
  }
  let id: string;
  try {
    id = String((await CreditBank.create({ name, active: true }))._id);
  } catch {
    return NextResponse.json({ error: 'Bankni qo\'shib bo\'lmadi.' }, { status: 400 });
  }
  await recordAudit(user, { action: 'finance.bank', entity: 'finance', entityId: id, summary: `Bank qo'shildi: ${name} (mobil)` });
  return NextResponse.json({ name }, { status: 201 });
}
