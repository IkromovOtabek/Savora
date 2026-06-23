'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/auth';
import { getTenantAdminSession } from '@/lib/tenantSession';
import { getMasterModels } from '@/lib/masterDb';
import { resolveOrgPlan } from '@/lib/plans';
import { logError } from '@/lib/logger';

type State = { error?: string; success?: string } | null;

function parseAmount(v: string): number | null {
  const n = Number(String(v).replace(/\s/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Do'kon admini — to'lov so'rovi yuboradi (chek yuklab) */
export async function submitPaymentRequestAction(_prev: State, formData: FormData): Promise<State> {
  // Muddati tugagan do'kon ham to'lov yubora olishi shart
  const { user, org } = await getTenantAdminSession({ allowExpired: true });

  const amount = parseAmount(String(formData.get('amount') || ''));
  const paidAtRaw = String(formData.get('paidAt') || '').trim();
  const months = Math.min(24, Math.max(1, parseInt(String(formData.get('months') || '1'), 10) || 1));
  const receiptUrl = String(formData.get('receiptUrl') || '').trim();
  const note = String(formData.get('note') || '').trim();

  if (amount === null) return { error: 'To\'lov summasi noto\'g\'ri.' };
  if (!receiptUrl) return { error: 'Chek (screenshot) yuklanishi shart.' };
  if (!paidAtRaw) return { error: 'To\'lov sanasini kiriting.' };

  const paidAt = new Date(paidAtRaw);
  if (Number.isNaN(paidAt.getTime())) return { error: 'To\'lov sanasi noto\'g\'ri.' };

  try {
    const { PaymentRequest } = await getMasterModels();

    // Avtomatik tekshiruvlar (yakuniy qaror — super admin'da)
    const flags: string[] = [];
    const plan = resolveOrgPlan(org);
    const expected = (plan.monthlyPayment || 0) * months;
    if (expected > 0 && amount < expected * 0.95) {
      flags.push(`Summa kutilganidan kam (kutilgan ~${expected.toLocaleString('uz-UZ')})`);
    }
    if (paidAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      flags.push('To\'lov sanasi kelajakda');
    }
    if (paidAt.getTime() < Date.now() - 60 * 24 * 60 * 60 * 1000) {
      flags.push('To\'lov sanasi juda eski (>60 kun)');
    }
    // Dublikat: shu do'kon + shu summa + shu sana, oxirgi 7 kun ichida
    const dupWindow = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dup = await PaymentRequest.findOne({
      organizationId: org._id,
      amount,
      paidAt,
      createdAt: { $gte: dupWindow },
    }).lean();
    if (dup) flags.push('Ehtimoliy dublikat (xuddi shunday so\'rov yaqinda yuborilgan)');

    // Kutilayotgan so'rov bo'lsa — yangisini bloklash
    const pending = await PaymentRequest.findOne({ organizationId: org._id, status: 'pending' }).lean();
    if (pending) {
      return { error: 'Sizda allaqachon tekshiruvdagi to\'lov so\'rovi bor. Tasdiqlangach yangisini yuboring.' };
    }

    await PaymentRequest.create({
      organizationId: org._id,
      orgName: org.name,
      orgSlug: org.slug,
      amount,
      paidAt,
      months,
      receiptUrl,
      note: note || undefined,
      status: 'pending',
      flags,
    });

    revalidatePath('/app/profile');
    return { success: 'To\'lov so\'rovi yuborildi. Tasdiqlangach obuna uzaytiriladi.' };
  } catch (err) {
    logError('submitPaymentRequestAction failed', err, { org: org.slug, user: user.username });
    return { error: 'So\'rov yuborishda xatolik.' };
  }
}

/** Super admin — to'lovni tasdiqlaydi → obuna uzayadi */
export async function approvePaymentRequestAction(_prev: State, formData: FormData): Promise<State> {
  const sa = await requireSuperAdmin();
  const requestId = String(formData.get('requestId') || '');
  if (!requestId) return { error: 'So\'rov topilmadi.' };

  try {
    const { PaymentRequest, Organization } = await getMasterModels();
    const req = await PaymentRequest.findById(requestId);
    if (!req) return { error: 'So\'rov topilmadi.' };
    if (req.status !== 'pending') return { error: 'Bu so\'rov allaqachon ko\'rib chiqilgan.' };

    const org = await Organization.findById(req.organizationId);
    if (!org) return { error: 'Do\'kon topilmadi.' };

    // Muddatni hozirgi yoki mavjud tugash sanasidan (qaysi kechroq) uzaytiramiz
    const base = org.expiresAt && org.expiresAt.getTime() > Date.now() ? new Date(org.expiresAt) : new Date();
    base.setMonth(base.getMonth() + req.months);
    org.expiresAt = base;
    org.status = 'active';
    if (org.plan) org.plan.isTrial = false;
    await org.save();

    req.status = 'approved';
    req.reviewedBy = sa.username;
    req.reviewedAt = new Date();
    await req.save();

    revalidatePath('/super/payments');
    revalidatePath('/super');
    return { success: `${org.name} obunasi ${req.months} oyga uzaytirildi (${base.toLocaleDateString('uz-UZ')}).` };
  } catch (err) {
    logError('approvePaymentRequestAction failed', err, { requestId });
    return { error: 'Tasdiqlashda xatolik.' };
  }
}

/** Super admin — to'lovni rad etadi */
export async function rejectPaymentRequestAction(_prev: State, formData: FormData): Promise<State> {
  const sa = await requireSuperAdmin();
  const requestId = String(formData.get('requestId') || '');
  const reason = String(formData.get('reason') || '').trim();
  if (!requestId) return { error: 'So\'rov topilmadi.' };

  try {
    const { PaymentRequest } = await getMasterModels();
    const req = await PaymentRequest.findById(requestId);
    if (!req) return { error: 'So\'rov topilmadi.' };
    if (req.status !== 'pending') return { error: 'Bu so\'rov allaqachon ko\'rib chiqilgan.' };

    req.status = 'rejected';
    req.reviewNote = reason || 'Tasdiqlanmadi';
    req.reviewedBy = sa.username;
    req.reviewedAt = new Date();
    await req.save();

    revalidatePath('/super/payments');
    return { success: 'So\'rov rad etildi.' };
  } catch (err) {
    logError('rejectPaymentRequestAction failed', err, { requestId });
    return { error: 'Xatolik.' };
  }
}

/** Super admin — to'lov hisob raqamini saqlaydi */
export async function savePaymentAccountAction(_prev: State, formData: FormData): Promise<State> {
  await requireSuperAdmin();
  const paymentCardNumber = String(formData.get('paymentCardNumber') || '').trim();
  const paymentCardHolder = String(formData.get('paymentCardHolder') || '').trim();
  const paymentNote = String(formData.get('paymentNote') || '').trim();

  try {
    const { PlatformSettings } = await getMasterModels();
    await PlatformSettings.updateOne(
      { key: 'default' },
      { $set: { paymentCardNumber, paymentCardHolder, paymentNote } },
      { upsert: true }
    );
    revalidatePath('/super/payments');
    return { success: 'To\'lov rekvizitlari saqlandi.' };
  } catch (err) {
    logError('savePaymentAccountAction failed', err);
    return { error: 'Saqlashda xatolik.' };
  }
}
