import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { verifyMobileToken } from '@/lib/mobileAuth';
import { mobilePermissionDenied } from '@/lib/permissionGuard';
import { getTenantModels } from '@/lib/tenantDb';
import { branchFilter } from '@/lib/branchScope';
import { calcSaleStatus } from '@/lib/sales';
import { computeInstallmentPlan } from '@/lib/installment';

/** Sotuv detali — nasiya bo'lsa oy jadvali (plan) bilan. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyMobileToken(req);
  if (!user || !user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Sotuv topilmadi.' }, { status: 404 });

  const { Sale } = await getTenantModels(user.dbName);
  const s = await Sale.findOne({ _id: id, ...branchFilter(user) }).lean();
  if (!s) return NextResponse.json({ error: 'Sotuv topilmadi.' }, { status: 404 });

  const plan = s.paymentType === 'installment' ? computeInstallmentPlan(s) : null;

  return NextResponse.json({
    id: String(s._id),
    saleNo: s.saleNo,
    product: s.productSnapshot?.name ?? '—',
    imei: s.productSnapshot?.imei ?? null,
    customer: s.customerSnapshot?.fullName ?? null,
    phone: s.customerSnapshot?.phone ?? null,
    paymentType: s.paymentType,
    bankName: s.bankName ?? null,
    totalAmount: s.totalAmount,
    paidAmount: s.paidAmount,
    remainingAmount: s.remainingAmount,
    installmentMonths: s.installmentMonths ?? null,
    dueDate: s.dueDate ?? null,
    status: s.status,
    createdAt: s.createdAt,
    soldBy: s.soldBy,
    payments: (s.payments ?? []).map((p) => ({ amount: p.amount, paidAt: p.paidAt, note: p.note ?? null, recordedBy: p.recordedBy ?? null })),
    plan: plan ? {
      total: plan.total, down: plan.down, monthly: plan.monthly, months: plan.months,
      monthsPaid: plan.monthsPaid, remaining: plan.remaining, overdueCount: plan.overdueCount,
      schedule: plan.schedule.map((m) => ({ month: m.month, amount: m.amount, paidAmount: m.paidAmount, paid: m.paid, state: m.state, dueDate: m.dueDate })),
    } : null,
  });
}

/** To'lov qo'shish (nasiya oyi / qarz). addSalePaymentAction mantiqi. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyMobileToken(req);
  if (!user || !user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  { const denied = await mobilePermissionDenied(user, 'payment.accept'); if (denied) return denied; }
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Sotuv topilmadi.' }, { status: 404 });

  let body: { amount?: number; note?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Noto\'g\'ri so\'rov.' }, { status: 400 }); }
  const amount = Number(body.amount) || 0;

  const { Sale } = await getTenantModels(user.dbName);
  const sale = await Sale.findOne({ _id: id, ...branchFilter(user) });
  if (!sale) return NextResponse.json({ error: 'Sotuv topilmadi.' }, { status: 404 });
  if (sale.status === 'cancelled') return NextResponse.json({ error: 'Bekor qilingan sotuv.' }, { status: 400 });
  if (sale.status === 'paid') return NextResponse.json({ error: 'Allaqachon to\'liq to\'langan.' }, { status: 400 });
  if (amount <= 0) return NextResponse.json({ error: 'To\'lov summasi noto\'g\'ri.' }, { status: 400 });
  if (amount > sale.remainingAmount) return NextResponse.json({ error: `Qoldiq: ${sale.remainingAmount}` }, { status: 400 });

  sale.paidAmount += amount;
  sale.remainingAmount = Math.max(0, sale.totalAmount - sale.paidAmount);
  sale.status = calcSaleStatus(sale.totalAmount, sale.paidAmount);
  sale.payments.push({ amount, paidAt: new Date(), note: String(body.note || '').trim() || undefined, recordedBy: user.username });
  await sale.save();

  return NextResponse.json({ ok: true, paidAmount: sale.paidAmount, remainingAmount: sale.remainingAmount, status: sale.status });
}
