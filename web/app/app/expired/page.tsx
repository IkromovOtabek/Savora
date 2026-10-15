import { redirect } from 'next/navigation';
import { requireOrgWithFeatures } from '@/lib/auth';
import { getMasterModels } from '@/lib/masterDb';
import { isOrganizationActive, daysUntilExpiry } from '@/lib/models/master/Organization';
import { resolveOrgPlan } from '@/lib/plans';
import { fmtDate } from '@/lib/format';
import PaymentSubmit from '@/components/tenant/PaymentSubmit';
import Icon from '@/components/icons/Icon';
import { AuthAlert } from '@/components/auth/AuthShell';

export const metadata = { title: 'Obuna muddati tugadi — Savora' };

export default async function ExpiredPage() {
  // Do'kon sessiyadan (slug/cookie'dan emas)
  const { user, org } = await requireOrgWithFeatures({ allowExpired: true });
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
    <div className="au-inline au-inline--wide">
      <div className="au-card au-card--wide">
        <div className="au-head" style={{ marginBottom: 0 }}>
          <span className="au-appicon au-appicon--danger" aria-hidden="true">
            <Icon name="clock" size={28} />
          </span>
          <h1 className="au-title">Obuna muddati tugadi</h1>
          <p className="au-sub">
            <strong>{org.name}</strong> obunasi <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtDate(org.expiresAt)}</span> sanasida tugagan
            {expiredDays > 0 ? ` (${expiredDays} kun oldin)` : ''}. Tizimdan foydalanish to&apos;xtatildi.
          </p>
          <p className="au-help" style={{ maxWidth: '52ch', marginTop: 6 }}>
            {isAdmin
              ? 'Davom etish uchun obunani uzaytiring — quyida to\'lovni amalga oshiring va chekni yuklang. Tasdiqlangach tizim avtomatik ochiladi.'
              : 'Do\'kon egasi (admin) obuna to\'lovini amalga oshirishi kerak. To\'lov tasdiqlangach tizim ochiladi. Iltimos, do\'kon egangizga murojaat qiling.'}
          </p>
        </div>
      </div>

      {isAdmin ? (
        <PaymentSubmit account={payAccount} monthlyPrice={monthlyPrice} requests={ownRequests} />
      ) : (
        <AuthAlert tone="warn">To&apos;lovni faqat do&apos;kon admini amalga oshira oladi.</AuthAlert>
      )}
    </div>
  );
}
