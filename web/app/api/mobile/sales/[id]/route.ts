import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { authenticateMobile } from '@/lib/mobileAuth';
import { mobilePermissionDenied } from '@/lib/permissionGuard';
import { recordAudit } from '@/lib/audit';
import { getTenantModels } from '@/lib/tenantDb';
import { branchFilter } from '@/lib/branchScope';
import { applySalePayment } from '@/lib/salePayment';
import { computeInstallmentPlan } from '@/lib/installment';
import { z } from 'zod';
import { readJsonInput, zMoney, zOneOf, zText } from '@/lib/validation';
import { PAY_METHODS, methodOf } from '@/lib/payMethods';
import { receiptPath } from '@/lib/receiptLink';

/** Sotuv detali — nasiya bo'lsa oy jadvali (plan) bilan. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
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
    payments: (s.payments ?? []).map((p) => ({ amount: p.amount, paidAt: p.paidAt, note: p.note ?? null, recordedBy: p.recordedBy ?? null, method: methodOf(p) })),
    // Ochiq chek havolasi — faqat yangi (checkoutId bor) sotuvlarda
    receiptPath: s.checkoutId && user.organizationId && s.status !== 'cancelled' ? receiptPath(user.organizationId, s.checkoutId) : null,
    plan: plan ? {
      total: plan.total, down: plan.down, monthly: plan.monthly, months: plan.months,
      monthsPaid: plan.monthsPaid, remaining: plan.remaining, overdueCount: plan.overdueCount,
      schedule: plan.schedule.map((m) => ({ month: m.month, amount: m.amount, paidAmount: m.paidAmount, paid: m.paid, state: m.state, dueDate: m.dueDate })),
    } : null,
  });
}

/** To'lov qo'shish (nasiya oyi / qarz). addSalePaymentAction mantiqi. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  { const denied = await mobilePermissionDenied(user, 'payment.accept'); if (denied) return denied; }
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Sotuv topilmadi.' }, { status: 404 });

  const input = await readJsonInput(req, z.object({
    // Butun so'm — kasr/manfiy summa rad etiladi
    amount: zMoney('To\'lov summasi noto\'g\'ri.', { min: 1 }),
    note: zText(300, 'Izoh juda uzun.'),
    method: zOneOf(PAY_METHODS, 'To\'lov usuli noto\'g\'ri.').optional(),
  }), { badJson: 'Noto\'g\'ri so\'rov.', fallback: 'Noto\'g\'ri so\'rov.' });
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });
  const { amount, note, method } = input.data;

  const { Sale } = await getTenantModels(user.dbName);
  const sale = await Sale.findOne({ _id: id, ...branchFilter(user) }).lean();
  if (!sale) return NextResponse.json({ error: 'Sotuv topilmadi.' }, { status: 404 });
  if (sale.status === 'cancelled') return NextResponse.json({ error: 'Bekor qilingan sotuv.' }, { status: 400 });
  if (sale.status === 'paid') return NextResponse.json({ error: 'Allaqachon to\'liq to\'langan.' }, { status: 400 });
  if (amount > sale.remainingAmount) return NextResponse.json({ error: `Qoldiq: ${sale.remainingAmount}` }, { status: 400 });

  // Atomik: qoldiq sharti bilan bitta yozuv (parallel to'lovda ortiqcha to'lov bo'lmaydi)
  const res = await applySalePayment(Sale, id, amount, {
    scope: branchFilter(user),
    note: note || undefined,
    recordedBy: user.username,
    method,
  });
  if (!res) {
    return NextResponse.json({ error: 'To\'lov qo\'shilmadi: qoldiq o\'zgargan. Qayta urinib ko\'ring.' }, { status: 409 });
  }

  await recordAudit(user, {
    action: 'sale.payment',
    entity: 'sale',
    entityId: id,
    summary: `To'lov ${sale.saleNo}: ${amount.toLocaleString('uz-UZ')} so'm (mobil)`,
    meta: { amount },
  });

  return NextResponse.json({ ok: true, ...res });
}
