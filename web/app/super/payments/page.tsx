import { requireSuperAdmin } from '@/lib/auth';
import { getMasterModels } from '@/lib/masterDb';
import { resolvePublicFileUrl } from '@/lib/storage';
import PaymentReview from '@/components/super/PaymentReview';

export const metadata = { title: 'To\'lovlar — Super Admin' };

export default async function SuperPaymentsPage() {
  await requireSuperAdmin();
  const { PaymentRequest, PlatformSettings } = await getMasterModels();

  const [requests, settings] = await Promise.all([
    PaymentRequest.find().sort({ status: 1, createdAt: -1 }).limit(200).lean(),
    PlatformSettings.findOne({ key: 'default' }).lean(),
  ]);

  const rows = requests.map((r) => ({
    id: String(r._id),
    orgName: r.orgName,
    orgSlug: r.orgSlug,
    amount: r.amount,
    paidAt: (r.paidAt ?? new Date()).toString(),
    months: r.months,
    receiptUrl: resolvePublicFileUrl(r.receiptUrl),
    note: r.note,
    status: r.status,
    flags: r.flags ?? [],
    reviewNote: r.reviewNote,
    reviewedBy: r.reviewedBy,
    createdAt: (r.createdAt ?? new Date()).toString(),
  }));

  const account = {
    paymentCardNumber: settings?.paymentCardNumber ?? '',
    paymentCardHolder: settings?.paymentCardHolder ?? '',
    paymentNote: settings?.paymentNote ?? '',
  };

  return (
    <>
      <div className="super-page-head">
        <div>
          <h1>To&apos;lovlar</h1>
          <p>Do&apos;konlar yuborgan to&apos;lov cheklari — tekshirib tasdiqlang</p>
        </div>
      </div>
      <PaymentReview requests={rows} account={account} />
    </>
  );
}
