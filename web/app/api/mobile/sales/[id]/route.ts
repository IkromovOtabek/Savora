import { NextResponse } from 'next/server';
import { addSalePayment, salePaymentErrorText } from '@/lib/sales/addPayment';
import { getDictionary } from '@/lib/i18n/dict';
import { Types } from 'mongoose';
import { authenticateMobile } from '@/lib/mobileAuth';
import { loadUserPermissions, mobilePermissionDenied, saleViewScope, userCan } from '@/lib/permissionGuard';
import { permissionDeniedError } from '@/lib/permissions';
import { getTenantModels } from '@/lib/tenantDb';
import { branchFilter } from '@/lib/branchScope';
import { computeInstallmentPlan } from '@/lib/installment';
import { z } from 'zod';
import { readJsonInput, zMoney, zOneOf, zText } from '@/lib/validation';
import { PAY_METHODS, methodOf } from '@/lib/payMethods';
import { receiptPath } from '@/lib/receiptLink';
import { saleBankParts } from '@/lib/bankCredit';
import { SALE_NOTES_MAX, editSale, type SaleEditError, type SaleEditInput } from '@/lib/saleEditOps';

/** Mobil ilova to'lovga qo'yadigan standart izoh (mobile/app/sale/[id].tsx) */
const MOBILE_DEFAULT_NOTE = 'Mobil to\'lov';

/** Sotuv detali — nasiya bo'lsa oy jadvali (plan) bilan. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Sotuv topilmadi.' }, { status: 404 });

  // «Sotuvlarni ko'rish» yo'q bo'lsa — faqat o'zi qilgan sotuv (chek uchun)
  const scope = saleViewScope(user, await loadUserPermissions(user));
  if (!scope) return NextResponse.json(permissionDeniedError('sales.view'), { status: 403 });
  const { Sale } = await getTenantModels(user.dbName);
  const s = await Sale.findOne({ _id: id, ...branchFilter(user), ...scope }).lean();
  if (!s) return NextResponse.json({ error: 'Sotuv topilmadi.' }, { status: 404 });

  const plan = s.paymentType === 'installment' ? computeInstallmentPlan(s) : null;
  // Bitta xariddagi tovarlar soni — tahrirlashda mijoz hammasiga qo'llanadi
  const checkoutItems = s.checkoutId ? await Sale.countDocuments({ checkoutId: s.checkoutId, ...branchFilter(user) }) : 1;

  return NextResponse.json({
    id: String(s._id),
    saleNo: s.saleNo,
    product: s.productSnapshot?.name ?? '—',
    imei: s.productSnapshot?.imei ?? null,
    customer: s.customerSnapshot?.fullName ?? null,
    phone: s.customerSnapshot?.phone ?? null,
    customerId: s.customerId ? String(s.customerId) : null,
    notes: s.notes ?? null,
    paymentType: s.paymentType,
    bankName: s.bankName ?? null,
    bankParts: saleBankParts(s),
    totalAmount: s.totalAmount,
    paidAmount: s.paidAmount,
    remainingAmount: s.remainingAmount,
    installmentMonths: s.installmentMonths ?? null,
    dueDate: s.dueDate ?? null,
    status: s.status,
    createdAt: s.createdAt,
    soldBy: s.soldBy,
    payments: (s.payments ?? []).map((p) => ({ amount: p.amount, paidAt: p.paidAt, note: p.note ?? null, recordedBy: p.recordedBy ?? null, method: methodOf(p) })),
    // Tahrirlash (eski ilova e'tiborsiz qoldiradi): tarix, xarid hajmi; narx tuzatilishida mijozga qaytarilgan pul
    edits: (s.edits ?? []).map((e) => ({ at: e.at, by: e.by, changes: e.changes.map((c) => ({ field: c.field, from: c.from ?? '', to: c.to ?? '' })) })),
    checkoutItems,
    priceRefunds: (s.returns ?? []).filter((r) => r.kind === 'price' && r.refundAmount > 0).map((r) => ({ amount: r.refundAmount, at: r.returnedAt, by: r.by })),
    // Qaytarish / bekor qilish (mobil 1.7+): miqdor va birlik, tovar qaytarishlari tarixi
    qty: s.productSnapshot?.saleQuantity ?? 1,
    unit: s.productSnapshot?.unit ?? null,
    itemReturns: (s.returns ?? []).filter((r) => r.kind !== 'price').map((r) => ({ qty: r.qty ?? 0, amount: r.amount ?? 0, refund: r.refundAmount ?? 0, at: r.returnedAt, by: r.by, reason: r.reason ?? null })),
    cancelledAt: s.cancelledAt ?? null,
    // Ochiq chek havolasi — faqat yangi (checkoutId bor) sotuvlarda
    receiptPath: s.checkoutId && user.organizationId && s.status !== 'cancelled' ? receiptPath(user.organizationId, s.checkoutId) : null,
    plan: plan ? {
      total: plan.total, down: plan.down, monthly: plan.monthly, months: plan.months,
      monthsPaid: plan.monthsPaid, remaining: plan.remaining, overdueCount: plan.overdueCount,
      // left — shu oydan qolgan qism (qisman to'lovda kamayadi); eski ilova uni e'tiborsiz qoldiradi
      schedule: plan.schedule.map((m) => ({ month: m.month, amount: m.amount, paidAmount: m.paidAmount, left: m.left, paid: m.paid, state: m.state, dueDate: m.dueDate })),
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

  // To'lov — lib/sales/addPayment (web va ommaviy to'lov bilan bir yadro: parallel to'lovdan himoya,
  // nasiya oylari, to'lovdan keyingi qoldiq). Ilovaning standart izohi — nasiyada haqiqiy taqsimot bilan almashadi
  const { Sale } = await getTenantModels(user.dbName);
  const r = await addSalePayment({ Sale }, user, {
    saleId: id, amount, method: method ?? 'cash', note, defaultNote: MOBILE_DEFAULT_NOTE, source: 'mobile',
  });
  if (!r.ok) {
    const status = r.error.code === 'saleNotFound' ? 404 : r.error.code === 'paymentConflict' ? 409 : 400;
    return NextResponse.json({ error: salePaymentErrorText(r.error, getDictionary('uz')) }, { status });
  }
  const { paymentId, paidAmount, remainingAmount, status } = r.done;
  return NextResponse.json({ ok: true, paidAmount, remainingAmount, status, paymentId });
}

/** Tahrirlash xatolari (mobil — o'zbekcha, mavjud API kabi) */
const EDIT_ERRORS: Record<SaleEditError, { error: string; status: number }> = {
  notFound: { error: 'Sotuv topilmadi.', status: 404 },
  cancelled: { error: 'Bekor qilingan sotuvni tahrirlab bo\'lmaydi.', status: 400 },
  bankCredit: { error: 'Bank krediti sotuvida narx o\'zgarmaydi.', status: 400 },
  badAmount: { error: 'Narx noto\'g\'ri (butun so\'mda, 1 so\'mdan katta).', status: 400 },
  belowDown: { error: 'Nasiyada narx boshlang\'ich to\'lovdan katta bo\'lishi kerak.', status: 400 },
  noChanges: { error: 'O\'zgarish yo\'q.', status: 400 },
  conflict: { error: 'Sotuv shu orada o\'zgardi. Yangilab qayta urinib ko\'ring.', status: 409 },
  pricePerm: { error: 'Narxni o\'zgartirish huquqi yo\'q.', status: 403 },
  customerRequired: { error: 'Qarz yoki qoldiqli sotuvda mijoz bo\'lishi shart.', status: 400 },
  dueNotAllowed: { error: 'Qarz muddati faqat qoldig\'i bor qarz yoki naqd sotuvda qo\'yiladi.', status: 400 },
  badDate: { error: 'Sana noto\'g\'ri.', status: 400 },
  nameRequired: { error: 'Mijoz ismi kiritilishi shart.', status: 400 },
  phoneRequired: { error: 'Telefon raqami shart.', status: 400 },
  badPhone: { error: 'Telefon raqami noto\'g\'ri.', status: 400 },
};

/**
 * Sotuvni tahrirlash — web editSaleAction bilan bir xil (lib/saleEditOps). Huquq «sale.edit», narx — «sale.editPrice».
 * Body (yuborilmagan maydon o'zgarmaydi): customer: { id?, name, phone } | null, notes, dueDate: 'YYYY-MM-DD' | null, totalAmount.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  { const denied = await mobilePermissionDenied(user, 'sale.edit'); if (denied) return denied; }
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json(EDIT_ERRORS.notFound, { status: 404 });

  const input = await readJsonInput(req, z.object({
    customer: z.union([
      z.null(),
      z.object({
        id: z.string().max(40).optional(),
        name: z.string().max(80, 'Ism juda uzun.'),
        phone: z.string().max(20, 'Telefon raqami noto\'g\'ri.'),
      }),
    ]).optional(),
    notes: z.string().max(SALE_NOTES_MAX, 'Izoh juda uzun.').optional(),
    dueDate: z.union([z.null(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana noto\'g\'ri.')]).optional(),
    totalAmount: z.number().int('Narx butun so\'mda bo\'lishi kerak.').optional(),
  }), { badJson: 'Noto\'g\'ri so\'rov.', fallback: 'Noto\'g\'ri so\'rov.' });
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });
  const b = input.data;

  const edit: SaleEditInput = {
    customer: b.customer === undefined ? undefined
      : b.customer === null || (!b.customer.id && !b.customer.name.trim() && !b.customer.phone.trim()) ? null
      : { id: b.customer.id, name: b.customer.name, phone: b.customer.phone },
    notes: b.notes,
    dueDate: b.dueDate === undefined ? undefined : b.dueDate === null ? null : new Date(b.dueDate),
    totalAmount: b.totalAmount,
  };

  const models = await getTenantModels(user.dbName);
  const res = await editSale(models, user, id, edit, { canEditPrice: await userCan(user, 'sale.editPrice') });
  if (!res.ok) {
    const e = EDIT_ERRORS[res.error];
    return NextResponse.json({ error: e.error }, { status: e.status });
  }
  const p = res.price;
  return NextResponse.json({
    ok: true,
    refundAmount: p?.refundAmount ?? 0,
    remainingAmount: p?.newRemaining ?? null,
    message: p && p.refundAmount > 0 ? `Saqlandi. Mijozga ${p.refundAmount.toLocaleString('uz-UZ')} so'm naqd qaytaring.`
      : p && p.newRemaining > 0 ? `Saqlandi. Qoldiq: ${p.newRemaining.toLocaleString('uz-UZ')} so'm.`
      : 'Saqlandi.',
  });
}
