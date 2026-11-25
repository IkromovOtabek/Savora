import { NextResponse } from 'next/server';
import { authenticateMobile } from '@/lib/mobileAuth';
import { recordCashFlow } from '@/lib/cashFlowEntry';
import { getDictionary } from '@/lib/i18n/dict';
import { tr } from '@/lib/i18n/fmt';
import { fmtMoney } from '@/lib/format';
import { getTenantModels } from '@/lib/tenantDb';
import { kirimChiqimDenied } from '@/lib/mobileOrg';
import { z } from 'zod';
import { readJsonInput, zMoney, zOneOf, zOptId, zReqText, zText } from '@/lib/validation';
import { ensureFinanceCategories } from '@/lib/financeCategories';
import { categoryInProfit } from '@/lib/models/tenant/FinanceCategory';

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

/** Kirim yoki chiqim qo'shish — lib/cashFlowEntry (web bilan bir qoida). */
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

  // Toifa, filial, smena va audit — lib/cashFlowEntry (web «Moliya» va «Xarajat qo'shish» bilan bir qoida).
  // Eski ilova toifasiz yuboradi — toifasiz chiqim «Boshqa xarajat» ga (sof foydadan ayiriladi)
  const m = await getTenantModels(user.dbName);
  const res = await recordCashFlow(m, user, { type, amount, category: input.data.category, description, branchId, source: 'mobile' });
  if (!res.ok) {
    const d = getDictionary('uz');
    const error = res.error.code === 'badCategory' ? 'Toifa topilmadi.'
      : res.error.code === 'badBranch' ? 'Filial topilmadi.'
      : res.error.code === 'opTooMuch' ? tr(d.sales.shifts.opTooMuch, { v: fmtMoney(res.error.current) })
      : d.sales.actions.saveFailed;
    return NextResponse.json({ error }, { status: res.error.code === 'failed' ? 500 : 400 });
  }
  return NextResponse.json({ id: res.id, type, amount, category: res.category || null }, { status: 201 });
}
