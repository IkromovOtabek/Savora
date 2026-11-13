import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Types } from 'mongoose';
import CustomerForm from '@/components/tenant/CustomerForm';
import { userCan } from '@/lib/permissionGuard';
import BackLink from '@/components/ui/BackLink';
import Icon from '@/components/icons/Icon';
import { Avatar, Pill } from '@/components/tenant/ClientsUi';
import { getTenantSession } from '@/lib/tenantSession';
import { branchAggMatch, branchFilter } from '@/lib/branchScope';
import { normalizePhone } from '@/lib/sms';
import { ledgerRemaining } from '@/lib/models/tenant/LedgerEntry';
import { fmtDate, fmtMoney } from '@/lib/format';
import { getDict } from '@/lib/i18n/server';
import { plural, tr } from '@/lib/i18n/fmt';
import '@/components/tenant/styles/clients.css';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.crm.customers.detailMetaTitle };
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();
  const { Customer, Sale, LedgerEntry, user, features } = await getTenantSession();
  const canManage = await userCan(user, 'customers.manage');
  const canDaftar = !!features.daftar && (await userCan(user, 'daftar.manage'));
  const customer = await Customer.findById(id).lean();
  if (!customer) notFound();
  const d = await getDict();
  const c = d.crm.customers;

  // 360° xulosa — bitta aggregate (filial login faqat o'z filiali bo'yicha)
  const [stats] = await Sale.aggregate<{ count: number; total: number; remaining: number; last?: Date }>([
    { $match: { customerId: new Types.ObjectId(String(customer._id)), status: { $ne: 'cancelled' }, ...branchAggMatch(user) } },
    { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$totalAmount' }, remaining: { $sum: { $cond: [{ $eq: ['$paymentType', 'bank_credit'] }, 0, '$remainingAmount'] } }, last: { $max: '$createdAt' } } },
  ]);

  // Daftar: mijozga bog'langan yoki shu telefon raqami bilan yozilgan qarzlar (eski yozuvlar ham)
  const ledger = canDaftar
    ? await LedgerEntry.find({
        ...branchFilter(user),
        $or: [{ customerId: customer._id }, { personPhone: normalizePhone(customer.phone) }],
      }).sort({ status: 1, dueDate: 1 }).limit(20).lean()
    : [];
  const k = d.sales.daftar;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  return (
    <div className="cl-page">
      <BackLink href="/app/customers">{c.title}</BackLink>

      <div className="cl-profile">
        <aside className="cl-card cl-pcard" aria-label={c.profileAria}>
          <Avatar name={customer.fullName} photoUrl={customer.photoUrl} size="lg" />
          <h1 className="cl-pcard-name">{customer.fullName}</h1>
          {customer.createdAt && <small className="cl-pcard-since">{tr(c.since, { date: fmtDate(customer.createdAt) })}</small>}

          <div className="cl-pcard-acts">
            <a href={`tel:${customer.phone}`} className="btn btn-tinted btn-with-icon"><Icon name="phone" size={16} /> {c.call}</a>
            <a href={`sms:${customer.phone}`} className="btn btn-tinted btn-with-icon"><Icon name="send" size={16} /> {c.sms}</a>
          </div>
          <Link href={`/app/customers/${String(customer._id)}/act`} className="btn btn-ghost btn-with-icon btn-full"><Icon name="clipboard" size={16} /> {c.act.open}</Link>

          <dl className="cl-plist">
            <div><dt><Icon name="phone" size={15} /> {d.common.phone}</dt><dd className="t-num">{customer.phone}</dd></div>
            <div><dt><Icon name="map" size={15} /> {c.address}</dt><dd>{customer.address || '—'}</dd></div>
            {customer.notes && <div><dt><Icon name="edit" size={15} /> {d.common.note}</dt><dd>{customer.notes}</dd></div>}
          </dl>

          <div className="cl-ptotals">
            <div><span>{c.salesCount}</span><b className="t-num">{stats?.count ?? 0}</b></div>
            <div><span>{c.totalAmount}</span><b className="t-num">{fmtMoney(stats?.total ?? 0)}</b></div>
            <div className={(stats?.remaining ?? 0) > 0 ? 'cl-ptotals--gold' : ''}><span>{c.remainingDebt}</span><b className="t-num">{fmtMoney(stats?.remaining ?? 0)}</b></div>
          </div>
          {stats?.last && <small className="cl-pcard-since">{tr(c.lastPurchase, { date: fmtDate(stats.last) })}</small>}
        </aside>

        {canManage && <CustomerForm
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
        />}
      </div>

      {ledger.length > 0 && (
        <section className="cl-card cl-pdaftar" aria-labelledby="cl-pdaftar-h">
          <header className="cl-pdaftar-h">
            <div>
              <h2 id="cl-pdaftar-h">{k.custTitle}</h2>
              <small>{k.custSub}</small>
            </div>
            <Link href="/app/daftar" className="btn btn-ghost btn-sm">{k.title} <Icon name="chevron" size={14} className="cl-pdaftar-go" /></Link>
          </header>
          <ul className="cl-lcol-list">
            {ledger.map((e) => {
              const open = e.status === 'open';
              const due = new Date(e.dueDate); due.setHours(0, 0, 0, 0);
              const lateDays = open ? Math.round((todayStart.getTime() - due.getTime()) / 86400000) : 0;
              return (
                <li key={String(e._id)} className={`cl-lentry${open ? '' : ' cl-lentry--done'}`}>
                  <div className="cl-lentry-main">
                    <b className="cl-row-name">{e.type === 'given' ? k.iGave : k.iTook}</b>
                    <small className="cl-row-sub">
                      {tr(k.returnDate, { date: fmtDate(e.dueDate) })}
                      {e.note ? ` · ${e.note}` : ''}
                    </small>
                  </div>
                  <div className="cl-lentry-side">
                    <b className="cl-row-amt t-num">{fmtMoney(open ? ledgerRemaining(e) : e.amount)}</b>
                    {open
                      ? lateDays > 0
                        ? <Pill tone="bad">{tr(plural(lateDays, d.sales.nDaysLate), { n: lateDays })}</Pill>
                        : <Pill tone={e.type === 'given' ? 'ok' : 'warn'}>{e.type === 'given' ? k.collect : k.giveBack}</Pill>
                      : <Pill tone="mut">{k.closed}</Pill>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
