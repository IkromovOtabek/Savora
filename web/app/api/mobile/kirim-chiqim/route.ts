import { NextResponse } from 'next/server';
import { verifyMobileToken } from '@/lib/mobileAuth';
import { mobilePermissionDenied } from '@/lib/permissionGuard';
import { getTenantModels } from '@/lib/tenantDb';

/** Kirim-chiqim ro'yxati + jami (kirim, chiqim, qoldiq). */
export async function GET(req: Request) {
  const user = await verifyMobileToken(req);
  if (!user || !user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  { const denied = await mobilePermissionDenied(user, 'kirimChiqim.manage'); if (denied) return denied; }

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
  const user = await verifyMobileToken(req);
  if (!user || !user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  { const denied = await mobilePermissionDenied(user, 'kirimChiqim.manage'); if (denied) return denied; }

  let body: { type?: string; amount?: number; description?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Noto\'g\'ri so\'rov.' }, { status: 400 }); }

  const type = body.type === 'income' || body.type === 'expense' ? body.type : null;
  const amount = Number(body.amount) || 0;
  const description = String(body.description || '').trim();
  if (!type) return NextResponse.json({ error: 'Tur noto\'g\'ri.' }, { status: 400 });
  if (amount <= 0) return NextResponse.json({ error: 'Summa noto\'g\'ri.' }, { status: 400 });
  if (!description) return NextResponse.json({ error: 'Izoh kiritilishi shart.' }, { status: 400 });

  const { CashFlow } = await getTenantModels(user.dbName);
  const entry = await CashFlow.create({ type, amount, description, recordedBy: user.username });
  return NextResponse.json({ id: String(entry._id), type, amount }, { status: 201 });
}
