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
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import { getDict } from '@/lib/i18n/server';
import { plural, qtyWithUnit, tr } from '@/lib/i18n/fmt';
import { bankPartsTotal } from '@/lib/bankCredit';
import '@/components/tenant/styles/clients.css';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.crm.customers.detailMetaTitle };
}

/** Xaridlar tarixi: avval oxirgilari, «Hammasini ko'rsatish» bilan — ko'pi bilan HISTORY_MAX */
const HISTORY_LIMIT = 30;
const HISTORY_MAX = 500;

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ all?: string }>;
}) {
  const { id } = await params;
  const showAll = (await searchParams).all === '1';
  if (!Types.ObjectId.isValid(id)) notFound();
  const { Customer, Sale, Branch, LedgerEntry, user, features } = await getTenantSession();
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

  // Xaridlar tarixi: nima, qachon, qaysi filialdan (filial login — faqat o'z filiali)
  const historyLimit = showAll ? HISTORY_MAX : HISTORY_LIMIT;
  const purchases = await Sale.find({ customerId: customer._id, ...branchFilter(user) })
    .sort({ createdAt: -1 })
    .limit(historyLimit + 1)
    .select('saleNo productSnapshot.name productSnapshot.imei productSnapshot.saleQuantity productSnapshot.unit branchId paymentType bankParts totalAmount remainingAmount status createdAt soldBy')
    .lean();
  const historyMore = purchases.length > historyLimit;
  const history = purchases.slice(0, historyLimit);
  const branchIds = [...new Set(history.map((s) => String(s.branchId)))];
  const branchName = new Map(
    (await Branch.find({ _id: { $in: branchIds } }).select('name').lean()).map((b) => [String(b._id), b.name]),
  );
  const h = c.history;

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

      <section className="cl-card cl-pdaftar" aria-labelledby="cl-phist-h">
        <header className="cl-pdaftar-h">
          <div>
            <h2 id="cl-phist-h">{h.title}</h2>
            <small>{h.sub}</small>
          </div>
        </header>
        {history.length === 0 ? (
          <p className="cl-phist-empty">{h.empty}</p>
        ) : (
          <ul className="cl-lcol-list" aria-label={h.listAria}>
            {history.map((s) => {
              const cancelled = s.status === 'cancelled';
              // Bank krediti: qoldiq — bank zimmasida (mijoz qarzi emas); bank + nasiya/qarz — faqat mijoz qismi
              const rest = s.paymentType === 'bank_credit' ? 0 : s.remainingAmount;
              const qty = s.productSnapshot?.saleQuantity;
              const bankPay = s.paymentType !== 'bank_credit' && bankPartsTotal(s.bankParts) > 0;
              return (
                <li key={String(s._id)} className={`cl-lentry${cancelled ? ' cl-lentry--done' : ''}`}>
                  <div className="cl-lentry-main">
                    <b className="cl-row-name">
                      <Link href={`/app/sales/${String(s._id)}`}>{s.productSnapshot?.name ?? '—'}</Link>
                      {qty && qty !== 1 ? <span className="cl-phist-qty"> × {qtyWithUnit(qty, s.productSnapshot?.unit, d.stock.fields.units)}</span> : null}
                    </b>
                    <small className="cl-row-sub">
                      <span className="t-num">{s.createdAt ? fmtDateTime(s.createdAt) : '—'}</span>
                      {' · '}<Icon name="building" size={12} /> {branchName.get(String(s.branchId)) ?? '—'}
                    </small>
                    <div className="cl-lentry-tags">
                      <small>{bankPay ? (s.paymentType === 'debt' ? d.sales.bankDebtShort : d.sales.bankNasiyaShort) : d.sales.paymentTypes[s.paymentType]}</small>
                      <small className="t-num">№ {s.saleNo}</small>
                      {s.soldBy && <small>{tr(h.by, { name: s.soldBy })}</small>}
                    </div>
                  </div>
                  <div className="cl-lentry-side">
                    <b className="cl-row-amt t-num">{fmtMoney(s.totalAmount)}</b>
                    {cancelled
                      ? <Pill tone="mut">{d.sales.saleStatus.cancelled}</Pill>
                      : rest > 0
                        ? <Pill tone="warn">{tr(h.rest, { sum: fmtMoney(rest) })}</Pill>
                        : <Pill tone="ok">{d.sales.saleStatus.paid}</Pill>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {(historyMore || showAll) && history.length > 0 && (
          <footer className="cl-phist-foot">
            <small>{tr(h.shownLast, { n: history.length })}</small>
            {historyMore && !showAll && (
              <Link href={`/app/customers/${String(customer._id)}?all=1`} className="btn btn-ghost btn-sm" scroll={false}>{h.showAll}</Link>
            )}
          </footer>
        )}
      </section>

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
