import { NextResponse } from 'next/server';
import { authenticateMobile } from '@/lib/mobileAuth';
import { mobilePermissionDenied } from '@/lib/permissionGuard';
import { recordAudit } from '@/lib/audit';
import { getTenantModels } from '@/lib/tenantDb';
import { getMobileFeatures } from '@/lib/mobileOrg';
import type { SessionUser } from '@/lib/session';
import { z } from 'zod';
import { readJsonInput, zMoney, zOneOf, zReqText } from '@/lib/validation';

/** Izoh uzunlik chegarasi — oshsa 400 */
const MAX_DESCRIPTION_LEN = 300;

/** Kirim-chiqim — faqat biznes egasi (admin) va modul yoqilgan bo'lsa (web bilan bir xil) */
async function denyUnlessAllowed(user: SessionUser): Promise<NextResponse | null> {
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Faqat biznes egasi uchun.' }, { status: 403 });
  }
  const features = await getMobileFeatures(user.organizationId);
  if (!features?.kirimChiqim) {
    return NextResponse.json({ error: 'Kirim-chiqim moduli yoqilmagan.' }, { status: 403 });
  }
  return null;
}

/** Kirim-chiqim ro'yxati + jami (kirim, chiqim, qoldiq). */
export async function GET(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  const denied = await denyUnlessAllowed(user);
  if (denied) return denied;
  { const noPerm = await mobilePermissionDenied(user, 'kirimChiqim.manage'); if (noPerm) return noPerm; }

  const { CashFlow } = await getTenantModels(user.dbName);
  const [items, agg] = await Promise.all([
    CashFlow.find({}).sort({ createdAt: -1 }).limit(100).lean(),
    CashFlow.aggregate([{ $group: { _id: '$type', total: { $sum: '$amount' } } }]),
  ]);
  const income = agg.find((a) => a._id === 'income')?.total ?? 0;
  const expense = agg.find((a) => a._id === 'expense')?.total ?? 0;

  return NextResponse.json({
    income, expense, balance: income - expense,
    items: items.map((c) => ({
      id: String(c._id), type: c.type, amount: c.amount, description: c.description,
      recordedBy: c.recordedBy, createdAt: c.createdAt,
    })),
  });
}

/** Kirim yoki chiqim qo'shish. createCashFlowAction mantiqi. */
export async function POST(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  const denied = await denyUnlessAllowed(user);
  if (denied) return denied;
  { const noPerm = await mobilePermissionDenied(user, 'kirimChiqim.manage'); if (noPerm) return noPerm; }

  const input = await readJsonInput(req, z.object({
    type: zOneOf(['income', 'expense'] as const, 'Tur noto\'g\'ri.'),
    // Butun so'm — kasr/manfiy summalar rad etiladi
    amount: zMoney('Summa noto\'g\'ri.', { min: 1 }),
    description: zReqText(MAX_DESCRIPTION_LEN, 'Izoh kiritilishi shart.', 'Izoh juda uzun.'),
  }), { badJson: 'Noto\'g\'ri so\'rov.', fallback: 'Noto\'g\'ri so\'rov.' });
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });
  const { type, amount, description } = input.data;

  const { CashFlow } = await getTenantModels(user.dbName);
  const entry = await CashFlow.create({ type, amount, description, recordedBy: user.username });
  await recordAudit(user, {
    action: type === 'income' ? 'finance.income' : 'finance.expense',
    entity: 'finance',
    entityId: String(entry._id),
    summary: `${type === 'income' ? 'Kirim' : 'Chiqim'}: ${amount.toLocaleString('uz-UZ')} so'm — ${description} (mobil)`,
    meta: { type, amount },
  });
  return NextResponse.json({ id: String(entry._id), type, amount }, { status: 201 });
}
