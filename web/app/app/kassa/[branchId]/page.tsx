import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Types } from 'mongoose';
import { getTenantSession } from '@/lib/tenantSession';
import { isBranchScoped } from '@/lib/branchScope';
import { dayRange, extractKassaPayments } from '@/lib/kassa';
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import KassaDateFilter from '@/components/tenant/KassaDateFilter';
import BackLink from '@/components/ui/BackLink';
import Icon from '@/components/icons/Icon';
import Tilt from '@/components/ui/Tilt';
import { getDict } from '@/lib/i18n/server';
import { plural, tr } from '@/lib/i18n/fmt';
import '@/components/tenant/styles/finance.css';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.sales.kassa.detailMetaTitle };
}

export default async function KassaBranchPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { branchId } = await params;
  const sp = await searchParams;
  const { user, Sale, Branch } = await getTenantSession();
  const d = await getDict();
  const k = d.sales.kassa;

  if (!Types.ObjectId.isValid(branchId)) notFound();
  // Filial login faqat o'z filiali kassasini ko'radi
  if (isBranchScoped(user) && String(user.branchId) !== branchId) notFound();
  const branch = await Branch.findById(branchId).lean();
  if (!branch) notFound();

  const { start, end, label } = dayRange(sp.date ?? new Date().toISOString().slice(0, 10));

  const sales = await Sale.find({
    branchId: branch._id,
    status: { $ne: 'cancelled' },
    $or: [
      { createdAt: { $gte: new Date(start.getTime() - 90 * 24 * 60 * 60 * 1000) } },
      { 'payments.paidAt': { $gte: start, $lt: end } },
    ],
  }).lean();

  const allRows = extractKassaPayments(sales, start, end);
  const rows = allRows.filter((r) => r.paymentType === 'cash');
  const total = rows.reduce((s, r) => s + r.amount, 0);

  const today = new Date().toISOString().slice(0, 10);
  // Vaqt chizig'i — kun ichida xronologik tartibda
  const timeline = [...rows].sort((a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime());
  const avg = rows.length > 0 ? Math.round(total / rows.length) : 0;
  const hhmm = (d: Date | string) => fmtDateTime(d).slice(-5);

  return (
    <div className="fn-page">
      <div className="t-page-head" style={{ marginBottom: 0 }}>
        <div>
          <div style={{ marginBottom: 8 }}>
            <BackLink href="/app/kassa" className="btn btn-plain btn-sm">
              {k.title}
            </BackLink>
          </div>
          <h1 className="t-page-title">{branch.name}</h1>
          <p className="t-page-sub">{k.cashPayments} · {fmtDate(start)}</p>
        </div>
      </div>
      {/* Kompyuterda yuqori paneldagi "Yangi sotuv" yetarli; telefonda — pastki o'ng tugma */}
      <Link href="/app/sales/new" className="ux-fab">
        <Icon name="plus" size={20} /> {d.common.sale}
      </Link>

      <KassaDateFilter initialDate={label} basePath={`/app/kassa/${branchId}`} today={today} />

      <Tilt stack as="section" className="fn-hero">
        <div className="fn-hero-top">
          <span className="fn-hero-label">{k.dailyCash}</span>
          <span className="fn-hero-chip">
            <Icon name="clock" size={14} /> {label === today ? d.common.today : fmtDate(start)}
          </span>
        </div>
        <div className="fn-hero-value fn-num ux-z">{fmtMoney(total)}<span className="fn-cur">{d.common.sum}</span></div>
        <div className="fn-hero-grid">
          <div className="fn-hero-stat">
            <span className="fn-hero-stat-l">{k.paymentsCount}</span>
            <span className="fn-hero-stat-v fn-num">{tr(d.common.nPcs, { n: rows.length })}</span>
          </div>
          <div className="fn-hero-stat">
            <span className="fn-hero-stat-l">{k.avgPayment}</span>
            <span className="fn-hero-stat-v fn-num">{fmtMoney(avg)}</span>
          </div>
        </div>
      </Tilt>

      <section className="fn-panel" aria-labelledby="kassa-tl">
        <div className="fn-panel-head">
          <h2 id="kassa-tl">{k.duringDay}</h2>
          <small>{tr(plural(rows.length, d.sales.nPayments), { n: rows.length })}</small>
        </div>
        {timeline.length === 0 ? (
          <div className="ux-empty">
            <span className="ux-empty-ic"><Icon name="wallet" size={26} /></span>
            <b>{k.emptyTitle}</b>
            <p>{k.emptyHint}</p>
            <Link href="/app/sales/new" className="btn btn-tinted btn-sm">{k.addSale}</Link>
          </div>
        ) : (
          <ol className="fn-timeline">
            {timeline.map((r, i) => (
              <li key={`${r.saleId}-${i}`} className="fn-tl-item">
                <time className="fn-tl-time" dateTime={new Date(r.paidAt).toISOString()}>{hhmm(r.paidAt)}</time>
                <span className="fn-tl-dot" aria-hidden="true" />
                <div className="fn-tl-main">
                  <Link href={`/app/sales/${r.saleId}`} className="fn-tl-title">{r.saleNo}</Link>
                  <span className="fn-tl-sub">{r.productName} · {r.customerName}</span>
                </div>
                <span className="fn-tl-amount">+{fmtMoney(r.amount)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
