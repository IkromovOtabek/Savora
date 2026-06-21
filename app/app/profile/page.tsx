import { getTenantSession } from '@/lib/tenantSession';
import { getMasterModels } from '@/lib/masterDb';
import { resolveOrgPlan } from '@/lib/plans';
import ProfileForms from '@/components/tenant/ProfileForms';
import TelegramConnect from '@/components/tenant/TelegramConnect';
import PaymentSubmit from '@/components/tenant/PaymentSubmit';
import ExpiryBanner from '@/components/ExpiryBanner';

export const metadata = { title: 'Kabinet — Savora' };

export default async function ProfilePage() {
  const { user, org, User } = await getTenantSession();
  const dbUser = await User.findById(user.id).lean();

  const isAdmin = user.role === 'admin';

  // To'lov bo'limi (faqat admin): rekvizitlar + o'z so'rovlari
  let payAccount = { paymentCardNumber: '', paymentCardHolder: '', paymentNote: '' };
  let ownRequests: {
    id: string; amount: number; months: number;
    status: 'pending' | 'approved' | 'rejected'; reviewNote?: string; createdAt: string;
  }[] = [];
  const monthlyPrice = resolveOrgPlan(org).monthlyPayment || 0;

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
      id: String(r._id),
      amount: r.amount,
      months: r.months,
      status: r.status,
      reviewNote: r.reviewNote,
      createdAt: (r.createdAt ?? new Date()).toString(),
    }));
  }

  return (
    <>
      <div className="dash-head">
        <div>
          <h1 className="dash-hello">Kabinet</h1>
          <p className="dash-sub">Foydalanuvchi: <strong>{user.username}</strong> · {isAdmin ? 'Admin' : 'Filial'}</p>
        </div>
      </div>

      {/* Obuna/sinov bildirishnomalari faqat shu yerda (Kabinet) ko'rsatiladi */}
      <ExpiryBanner org={org} showPayButton={isAdmin} />

      <ProfileForms
        username={user.username}
        fullName={dbUser?.fullName ?? ''}
        mustChangePassword={Boolean(dbUser?.mustChangePassword)}
      />

      {isAdmin && (
        <PaymentSubmit account={payAccount} monthlyPrice={monthlyPrice} requests={ownRequests} />
      )}

      {isAdmin && (
        <TelegramConnect orgId={org._id} connected={!!org.telegramChatId} />
      )}
    </>
  );
}
