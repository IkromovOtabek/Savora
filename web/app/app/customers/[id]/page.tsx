import { notFound } from 'next/navigation';
import { Types } from 'mongoose';
import CustomerForm from '@/components/tenant/CustomerForm';
import BackLink from '@/components/ui/BackLink';
import Icon from '@/components/icons/Icon';
import { Avatar } from '@/components/tenant/ClientsUi';
import { getTenantSession } from '@/lib/tenantSession';
import { branchAggMatch } from '@/lib/branchScope';
import { fmtDate, fmtMoney } from '@/lib/format';
import '@/components/tenant/styles/clients.css';

export const metadata = { title: 'Mijoz — Savora' };

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();
  const { Customer, Sale, user, features } = await getTenantSession();
  const customer = await Customer.findById(id).lean();
  if (!customer) notFound();

  // 360° xulosa — bitta aggregate (filial login faqat o'z filiali bo'yicha)
  const [stats] = await Sale.aggregate<{ count: number; total: number; remaining: number; last?: Date }>([
    { $match: { customerId: new Types.ObjectId(String(customer._id)), status: { $ne: 'cancelled' }, ...branchAggMatch(user) } },
    { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$totalAmount' }, remaining: { $sum: '$remainingAmount' }, last: { $max: '$createdAt' } } },
  ]);

  return (
    <div className="cl-page">
      <BackLink href="/app/customers">Mijozlar</BackLink>

      <div className="cl-profile">
        <aside className="cl-card cl-pcard" aria-label="Mijoz profili">
          <Avatar name={customer.fullName} photoUrl={customer.photoUrl} size="lg" />
          <h1 className="cl-pcard-name">{customer.fullName}</h1>
          {customer.createdAt && <small className="cl-pcard-since">Mijoz: {fmtDate(customer.createdAt)} dan</small>}

          <div className="cl-pcard-acts">
            <a href={`tel:${customer.phone}`} className="btn btn-tinted btn-with-icon"><Icon name="phone" size={16} /> Qo&apos;ng&apos;iroq</a>
            <a href={`sms:${customer.phone}`} className="btn btn-tinted btn-with-icon"><Icon name="send" size={16} /> SMS</a>
          </div>

          <dl className="cl-plist">
            <div><dt><Icon name="phone" size={15} /> Telefon</dt><dd className="t-num">{customer.phone}</dd></div>
            <div><dt><Icon name="map" size={15} /> Manzil</dt><dd>{customer.address || '—'}</dd></div>
            {customer.notes && <div><dt><Icon name="edit" size={15} /> Izoh</dt><dd>{customer.notes}</dd></div>}
          </dl>

          <div className="cl-ptotals">
            <div><span>Sotuvlar</span><b className="t-num">{stats?.count ?? 0}</b></div>
            <div><span>Jami summa</span><b className="t-num">{fmtMoney(stats?.total ?? 0)}</b></div>
            <div className={(stats?.remaining ?? 0) > 0 ? 'cl-ptotals--gold' : ''}><span>Qoldiq qarz</span><b className="t-num">{fmtMoney(stats?.remaining ?? 0)}</b></div>
          </div>
          {stats?.last && <small className="cl-pcard-since">Oxirgi xarid: {fmtDate(stats.last)}</small>}
        </aside>

        <CustomerForm
          mode="edit"
          mediaEnabled={features.mediaUpload}
          initial={{
            id: String(customer._id),
            fullName: customer.fullName,
            phone: customer.phone,
            address: customer.address ?? '',
            notes: customer.notes ?? '',
            photoUrl: customer.photoUrl,
          }}
        />
      </div>
    </div>
  );
}
