import { NextResponse } from 'next/server';
import { authenticateMobile } from '@/lib/mobileAuth';
import { recordAudit } from '@/lib/audit';
import { getTenantModels } from '@/lib/tenantDb';
import { kirimChiqimDenied } from '@/lib/mobileOrg';
import { z } from 'zod';
import { readJsonInput, zMoney, zOneOf, zOptId, zReqText, zText } from '@/lib/validation';
import { ensureFinanceCategories } from '@/lib/financeCategories';
import { categoryInProfit, OTHER_EXPENSE_CATEGORY } from '@/lib/models/tenant/FinanceCategory';

/** Izoh uzunlik chegarasi — oshsa 400 */
const MAX_DESCRIPTION_LEN = 300;

/** Kirim-chiqim ro'yxati + jami (kirim, chiqim, qoldiq). */
export async function GET(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  const denied = await kirimChiqimDenied(user);
  if (denied) return denied;

  const { CashFlow, Branch, FinanceCategory } = await getTenantModels(user.dbName);
  await ensureFinanceCategories(FinanceCategory);
  const [items, agg, branches, categories] = await Promise.all([
    CashFlow.find({}).sort({ createdAt: -1 }).limit(100).lean(),
    CashFlow.aggregate([{ $group: { _id: '$type', total: { $sum: '$amount' } } }]),
    Branch.find({ active: true }).select('name').sort({ createdAt: 1 }).lean(),
    // Forma uchun: tizim toifalari (kassaga pul qo'shish/olish) qo'lda tanlanmaydi
    FinanceCategory.find({ active: true, system: { $ne: true } }).select('name type system inProfit').sort({ name: 1 }).limit(100).lean(),
  ]);
  const income = agg.find((a) => a._id === 'income')?.total ?? 0;
  const expense = agg.find((a) => a._id === 'expense')?.total ?? 0;
  const branchName = new Map(branches.map((b) => [String(b._id), b.name]));

  return NextResponse.json({
    income, expense, balance: income - expense,
    branches: branches.map((b) => ({ id: String(b._id), name: b.name })),
    categories: categories.map((c) => ({ name: c.name, type: c.type, inProfit: categoryInProfit(c) })),
    items: items.map((c) => ({
      id: String(c._id), type: c.type, amount: c.amount, description: c.description,
      category: c.category || null,
      branch: c.branchId ? branchName.get(String(c.branchId)) ?? null : null,
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
  const denied = await kirimChiqimDenied(user);
  if (denied) return denied;

  const input = await readJsonInput(req, z.object({
    type: zOneOf(['income', 'expense'] as const, 'Tur noto\'g\'ri.'),
    // Butun so'm — kasr/manfiy summalar rad etiladi
    amount: zMoney('Summa noto\'g\'ri.', { min: 1 }),
    description: zReqText(MAX_DESCRIPTION_LEN, 'Izoh kiritilishi shart.', 'Izoh juda uzun.'),
    category: zText(60, 'Toifa noto\'g\'ri.'),
    branchId: zOptId('Filial noto\'g\'ri.'),
  }), { badJson: 'Noto\'g\'ri so\'rov.', fallback: 'Noto\'g\'ri so\'rov.' });
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });
  const { type, amount, description, branchId } = input.data;

  const { CashFlow, Branch, FinanceCategory } = await getTenantModels(user.dbName);
  let category = input.data.category;
  if (category) {
    if (!(await FinanceCategory.exists({ name: category, type, active: true }))) {
      return NextResponse.json({ error: 'Toifa topilmadi.' }, { status: 400 });
    }
  } else if (type === 'expense') {
    // Eski ilova toifasiz yuboradi — toifasiz chiqim sof foydadan ayirilmasdi
    category = OTHER_EXPENSE_CATEGORY;
    await FinanceCategory.updateOne(
      { name: category, type: 'expense' },
      { $setOnInsert: { name: category, type: 'expense', active: true } },
      { upsert: true },
    );
  }
  if (branchId && !(await Branch.exists({ _id: branchId, active: true }))) {
    return NextResponse.json({ error: 'Filial topilmadi.' }, { status: 400 });
  }

  const entry = await CashFlow.create({
    type, amount, description, recordedBy: user.username,
    ...(category ? { category } : {}),
    ...(branchId ? { branchId } : {}),
  });
  await recordAudit(user, {
    action: type === 'income' ? 'finance.income' : 'finance.expense',
    entity: 'finance',
    entityId: String(entry._id),
    summary: `${type === 'income' ? 'Kirim' : 'Chiqim'}${category ? ` (${category})` : ''}: ${amount.toLocaleString('uz-UZ')} so'm — ${description} (mobil)`,
    meta: { type, amount, category, branchId },
  });
  return NextResponse.json({ id: String(entry._id), type, amount, category: category || null }, { status: 201 });
}
