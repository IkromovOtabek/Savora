import { redirect } from 'next/navigation';
import { requireOrgUser } from '@/lib/auth';
import { resolveTenant } from '@/lib/tenantContext';
import { getMasterModels } from '@/lib/masterDb';
import { isOrganizationActive, daysUntilExpiry } from '@/lib/models/master/Organization';
import { resolveOrgPlan } from '@/lib/plans';
import { fmtDate } from '@/lib/format';
import PaymentSubmit from '@/components/tenant/PaymentSubmit';
import Icon from '@/components/icons/Icon';

export const metadata = { title: 'Obuna muddati tugadi — Savora' };

export default async function ExpiredPage() {
  const user = await requireOrgUser({ allowExpired: true });
  const org = await resolveTenant();
  if (!org) redirect('/login');
  // Faol bo'lsa — bu sahifa kerak emas
  if (isOrganizationActive(org)) redirect('/app');

  const isAdmin = user.role === 'admin';
  const monthlyPrice = resolveOrgPlan(org).monthlyPayment || 0;
  const expiredDays = Math.abs(daysUntilExpiry(org));

  let payAccount = { paymentCardNumber: '', paymentCardHolder: '', paymentNote: '' };
  let ownRequests: {
    id: string; amount: number; months: number;
    status: 'pending' | 'approved' | 'rejected'; reviewNote?: string; createdAt: string;
  }[] = [];

  if (isAdmin) {
    const { PlatformSettings, PaymentRequest } = await getMasterModels();
    const [settings, reqs] = await Promise.all([
      PlatformSettings.findOne({ key: 'default' }).lean(),
      PaymentRequest.find({ organizationId: org._id }).sort({ createdAt: -1 }).limit(10).lean(),
    ]);
    payAccount = {
      paymentCardNumber: settings?.paymentCardNumber ?? '',
      paymentCardHolder: settings?.paymentCardHolder ?? '',
      paymentNote: settings?.paymentNote ?? '',
    };
    ownRequests = reqs.map((r) => ({
      id: String(r._id), amount: r.amount, months: r.months,
      status: r.status, reviewNote: r.reviewNote,
      createdAt: (r.createdAt ?? new Date()).toString(),
    }));
  }

  return (
    <div className="dash-main" style={{ maxWidth: 720 }}>
      <div className="locked-card" style={{ marginBottom: 20 }}>
        <div className="locked-icon" style={{ background: '#fef2f2', color: '#dc2626' }}>
          <Icon name="clock" size={32} />
        </div>
        <h1>Obuna muddati tugadi</h1>
        <p>
          <strong>{org.name}</strong> obunasi {fmtDate(org.expiresAt)} sanasida tugagan
          {expiredDays > 0 ? ` (${expiredDays} kun oldin)` : ''}. Tizimdan foydalanish to&apos;xtatildi.
        </p>
        <p className="locked-sub">
          {isAdmin
            ? 'Davom etish uchun obunani uzaytiring — quyida to\'lovni amalga oshiring va chekni yuklang. Tasdiqlangach tizim avtomatik ochiladi.'
            : 'Do\'kon egasi (admin) obuna to\'lovini amalga oshirishi kerak. To\'lov tasdiqlangach tizim ochiladi. Iltimos, do\'kon egangizga murojaat qiling.'}
        </p>
      </div>

      {isAdmin ? (
        <PaymentSubmit account={payAccount} monthlyPrice={monthlyPrice} requests={ownRequests} />
      ) : (
        <div className="auth-alert auth-alert--warn">
          To&apos;lovni faqat do&apos;kon admini amalga oshira oladi.
        </div>
      )}
    </div>
  );
}
