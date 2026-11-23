import { NextResponse } from 'next/server';
import { authenticateMobile } from '@/lib/mobileAuth';
import { getTenantModels } from '@/lib/tenantDb';
import { kirimChiqimDenied } from '@/lib/mobileOrg';
import { monthRange, profitReport, type ProfitSaleLine } from '@/lib/monitoring';
import { saleProfitRevenue } from '@/lib/bankCredit';
import { earlierNasiyaFilter, saleProfitParts } from '@/lib/saleProfit';

/**
 * Oylik foyda hisobi — web «Hisobot → Foyda hisobi» bilan bir formula:
 * sof foyda = (sotuv − tannarx) + boshqa kirimlar − xarajatlar (faqat foydaga kiruvchi toifalar).
 * Bank krediti: bank ulushi sotuvda foydaga kirmaydi — bankdan pul olingan kuni (BankReceipt.receivedAt) kiradi.
 * Nasiya: tannarx to'lanmaguncha foyda yo'q, undan oshgan to'lovlar to'lov kuni (lib/saleProfit.ts).
 * `?month=YYYY-MM` (standart — joriy oy). Faqat biznes egasi.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  const denied = await kirimChiqimDenied(user);
  if (denied) return denied;

  const now = new Date();
  const raw = new URL(req.url).searchParams.get('month') ?? '';
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  const y = match ? Number(match[1]) : now.getFullYear();
  const m = match && Number(match[2]) >= 1 && Number(match[2]) <= 12 ? Number(match[2]) : now.getMonth() + 1;
  const { start, end } = monthRange(y, m);
  const range = { createdAt: { $gte: start, $lt: end } };

  const { Sale, Product, Branch, CashFlow, FinanceCategory, BankReceipt } = await getTenantModels(user.dbName);
  const saleFields = 'branchId productId totalAmount paidAmount remainingAmount paymentType bankName bankParts productSnapshot createdAt payments.amount payments.paidAt returns.refundAmount returns.returnedAt';
  const [branches, sales, flows, categories, receipts] = await Promise.all([
    Branch.find({ active: true }).select('name').sort({ createdAt: 1 }).lean(),
    // Shu oy sotuvlari + oldin sotilgan nasiyalarning shu oydagi to'lovlari
    Sale.find({ $or: [{ ...range, status: { $ne: 'cancelled' } }, earlierNasiyaFilter(start, end)] }).select(saleFields).lean(),
    CashFlow.find({ ...range, category: { $nin: [null, ''] } }).select('type amount category branchId createdAt').lean(),
    FinanceCategory.find().select('name type system inProfit').lean(),
    BankReceipt.find({ receivedAt: { $gte: start, $lt: end } }).select('amount branchId receivedAt').lean(),
  ]);

  // Tannarx — sotuv vaqtidagi snapshot; eski sotuvlarda yo'q bo'lsa mahsulotning joriy xarid narxi (web kabi)
  const missing = sales.filter((s) => s.productSnapshot?.purchasePrice == null).map((s) => s.productId);
  const fallback = missing.length
    ? new Map((await Product.find({ _id: { $in: missing } }).select('purchasePrice').lean()).map((p) => [String(p._id), p.purchasePrice ?? 0]))
    : new Map<string, number>();
  const lines: ProfitSaleLine[] = sales.map((s) => {
    const unit = s.productSnapshot?.purchasePrice ?? fallback.get(String(s.productId)) ?? 0;
    const cost = unit * (s.productSnapshot?.saleQuantity ?? 1);
    return { branchId: String(s.branchId), revenue: saleProfitRevenue(s), cost, at: s.createdAt ?? start, parts: saleProfitParts(s, cost) };
  });

  const report = profitReport({
    lines,
    flows,
    categories,
    branches: branches.map((b) => ({ id: String(b._id), name: b.name })),
    receipts: receipts.map((r) => ({ amount: r.amount, branchId: r.branchId, at: r.receivedAt })),
    start,
    end,
  });

  return NextResponse.json({
    month: `${y}-${String(m).padStart(2, '0')}`,
    ...report,
  });
}
