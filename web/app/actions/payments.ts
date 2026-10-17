'use server';

import { revalidatePath } from 'next/cache';
import { Types } from 'mongoose';
import { requireSuperAdmin } from '@/lib/auth';
import { ownUploadKeyFromUrl } from '@/lib/fileUrl';
import { getTenantAdminSession } from '@/lib/tenantSession';
import { getMasterModels } from '@/lib/masterDb';
import { resolveOrgPlan } from '@/lib/plans';
import { logError } from '@/lib/logger';
import { addMonthsClamped } from '@/lib/dates';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';

type State = { error?: string; success?: string } | null;

function parseAmount(v: string): number | null {
  const n = Number(String(v).replace(/\s/g, ''));
  // Butun so'm — kasr summalar rad etiladi
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

/** Do'kon admini — to'lov so'rovi yuboradi (chek yuklab) */
export async function submitPaymentRequestAction(_prev: State, formData: FormData): Promise<State> {
  // Muddati tugagan do'kon ham to'lov yubora olishi shart
  const { user, org } = await getTenantAdminSession({ allowExpired: true });
  const m = (await getDict()).sales.actions;

  const amount = parseAmount(String(formData.get('amount') || ''));
  const paidAtRaw = String(formData.get('paidAt') || '').trim();
  const months = Math.min(24, Math.max(1, parseInt(String(formData.get('months') || '1'), 10) || 1));
  const receiptUrl = String(formData.get('receiptUrl') || '').trim();
  const note = String(formData.get('note') || '').trim();

  if (amount === null) return { error: m.badPaymentAmount };
  if (!receiptUrl) return { error: m.receiptRequired };
  // Faqat o'zimizning storage'ga `receipts/` papkasiga yuklangan fayl — tashqi/zararli URL rad
  const receiptKey = ownUploadKeyFromUrl(receiptUrl);
  if (!receiptKey || !receiptKey.startsWith('receipts/')) {
    return { error: m.badReceiptUrl };
  }
  if (!paidAtRaw) return { error: m.enterPayDate };

  const paidAt = new Date(paidAtRaw);
  if (Number.isNaN(paidAt.getTime())) return { error: m.badPayDate };

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
      return { error: m.pendingExists };
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
    return { success: m.requestSent };
  } catch (err) {
    logError('submitPaymentRequestAction failed', err, { org: org.slug, user: user.username });
    return { error: m.requestFailed };
  }
}

/** Super admin — to'lovni tasdiqlaydi → obuna uzayadi */
export async function approvePaymentRequestAction(_prev: State, formData: FormData): Promise<State> {
  const sa = await requireSuperAdmin();
  const m = (await getDict()).sales.actions;
  const requestId = String(formData.get('requestId') || '');
  if (!requestId || !Types.ObjectId.isValid(requestId)) return { error: m.requestNotFound };

  try {
    const { PaymentRequest, Organization } = await getMasterModels();
    // Atomik: faqat `pending` so'rov bir marta `approved` bo'ladi — ikki parallel tasdiq
    // (yoki tasdiq + rad) obunani ikki marta uzaytirmaydi (TOCTOU)
    const req = await PaymentRequest.findOneAndUpdate(
      { _id: requestId, status: 'pending' },
      { $set: { status: 'approved', reviewedBy: sa.username, reviewedAt: new Date() } },
      { new: true }
    );
    if (!req) {
      const exists = await PaymentRequest.exists({ _id: requestId });
      return { error: exists ? m.requestReviewed : m.requestNotFound };
    }

    const org = await Organization.findById(req.organizationId);
    if (!org) {
      // Do'kon yo'q — so'rovni qayta `pending` ga qaytaramiz (yetim "approved" qolmasin)
      await PaymentRequest.updateOne(
        { _id: req._id, status: 'approved' },
        { $set: { status: 'pending' }, $unset: { reviewedBy: 1, reviewedAt: 1 } }
      );
      return { error: m.orgNotFound };
    }

    // Muddatni hozirgi yoki mavjud tugash sanasidan (qaysi kechroq) uzaytiramiz
    const base = org.expiresAt && org.expiresAt.getTime() > Date.now() ? new Date(org.expiresAt) : new Date();
    org.expiresAt = addMonthsClamped(base, req.months); // oy oxiri to'g'ri (31-yan → fev oxiri)
    org.status = 'active';
    if (org.plan) org.plan.isTrial = false;
    await org.save();

    revalidatePath('/super/payments');
    revalidatePath('/super');
    return { success: tr(m.subscriptionExtended, { org: org.name, months: req.months, date: base.toLocaleDateString('uz-UZ') }) };
  } catch (err) {
    logError('approvePaymentRequestAction failed', err, { requestId });
    return { error: m.approveFailed };
  }
}

/** Super admin — to'lovni rad etadi */
export async function rejectPaymentRequestAction(_prev: State, formData: FormData): Promise<State> {
  const sa = await requireSuperAdmin();
  const m = (await getDict()).sales.actions;
  const requestId = String(formData.get('requestId') || '');
  const reason = String(formData.get('reason') || '').trim();
  if (!requestId || !Types.ObjectId.isValid(requestId)) return { error: m.requestNotFound };

  try {
    const { PaymentRequest } = await getMasterModels();
    // Atomik: faqat `pending` so'rov rad etiladi (tasdiq bilan poyga bo'lmasin)
    const req = await PaymentRequest.findOneAndUpdate(
      { _id: requestId, status: 'pending' },
      {
        $set: {
          status: 'rejected',
          reviewNote: reason.slice(0, 300) || 'Tasdiqlanmadi',
          reviewedBy: sa.username,
          reviewedAt: new Date(),
        },
      },
      { new: true }
    );
    if (!req) {
      const exists = await PaymentRequest.exists({ _id: requestId });
      return { error: exists ? m.requestReviewed : m.requestNotFound };
    }

    revalidatePath('/super/payments');
    return { success: m.requestRejected };
  } catch (err) {
    logError('rejectPaymentRequestAction failed', err, { requestId });
    return { error: m.genericError };
  }
}

/** Super admin — to'lov hisob raqamini saqlaydi */
export async function savePaymentAccountAction(_prev: State, formData: FormData): Promise<State> {
  await requireSuperAdmin();
  const m = (await getDict()).sales.actions;
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
    return { success: m.accountSaved };
  } catch (err) {
    logError('savePaymentAccountAction failed', err);
    return { error: m.saveFailed };
  }
}
