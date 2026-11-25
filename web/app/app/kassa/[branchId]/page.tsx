import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Types } from 'mongoose';
import { getTenantSession } from '@/lib/tenantSession';
import { isBranchScoped } from '@/lib/branchScope';
import { KASSA_SALE_FILTER, extractKassaPayments, isCashRow, sumByMethod } from '@/lib/kassa';
import { isDayPeriod, periodRange, toDayKey } from '@/lib/period';
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
  const { user, Sale, Branch, BankReceipt } = await getTenantSession();
  const d = await getDict();
  const k = d.sales.kassa;

  if (!Types.ObjectId.isValid(branchId)) notFound();
  // Filial login faqat o'z filiali kassasini ko'radi
  if (isBranchScoped(user) && String(user.branchId) !== branchId) notFound();
  const branch = await Branch.findById(branchId).lean();
  if (!branch) notFound();

  // Kun — mahalliy (kunlik kirim-chiqim bilan bir xil); toISOString UTC bo'lib, tungi soatlarda kechagi kun chiqardi
  const today = toDayKey(new Date());
  const label = isDayPeriod(sp.date) && sp.date <= today ? sp.date : today;
  const { start, end } = periodRange(label);

  const sales = await Sale.find({
    branchId: branch._id,
    // Bekor qilingan (yangi tartib) sotuv to'lovi — realizatsiya bo'lib qoladi (lib/kassa)
    $and: [
      KASSA_SALE_FILTER,
      {
        $or: [
          { createdAt: { $gte: new Date(start.getTime() - 90 * 24 * 60 * 60 * 1000) } },
          { 'payments.paidAt': { $gte: start, $lt: end } },
          { 'returns.returnedAt': { $gte: start, $lt: end } },
        ],
      },
    ],
  }).lean();

  const allRows = extractKassaPayments(sales, start, end);
  const rows = allRows.filter(isCashRow);
  // Kredit kassada shu filial kassasiga olingan bank puli — naqd kassaga qo'shiladi
  const bankReceipts = await BankReceipt.find({ branchId: branch._id, receivedAt: { $gte: start, $lt: end } })
    .select('bankName amount receivedAt note').lean();
  const bankTotal = bankReceipts.reduce((s, r) => s + r.amount, 0);
  // Karta/o'tkazma — naqd kassaga kirmaydi, alohida ko'rsatiladi
  const byMethod = Object.entries(sumByMethod(allRows));
  const cardTotal = byMethod.reduce((s, [, v]) => s + (v ?? 0), 0);
  const total = rows.reduce((s, r) => s + r.amount, 0) + bankTotal;
  const payRows = rows.filter((r) => !r.isRefund);

  // Vaqt chizig'i — kun ichida xronologik tartibda (sotuv to'lovlari + bank tushumlari)
  const timeline = [
    ...rows.map((r, i) => ({
      key: `${r.saleId}-${i}`, at: new Date(r.paidAt), href: `/app/sales/${r.saleId}`, title: r.saleNo,
      sub: `${r.isRefund ? `${k.refundRow} · ` : ''}${r.productName} · ${r.customerName}${r.cancelled ? ` · ${k.cancelledTag}` : ''}`, amount: r.amount, out: r.isRefund,
    })),
    ...bankReceipts.map((r) => ({
      key: `bank-${String(r._id)}`, at: new Date(r.receivedAt), href: '/app/kredit-kassa',
      title: tr(d.crm.money.bankRowTitle, { name: r.bankName }), sub: r.note || d.crm.money.fromBank, amount: r.amount, out: false,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  const payTotal = payRows.reduce((s, r) => s + r.amount, 0);
  const avg = payRows.length > 0 ? Math.round(payTotal / payRows.length) : 0;
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
      <Link href="/app/pos" className="ux-fab">
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
            <span className="fn-hero-stat-v fn-num">{tr(d.common.nPcs, { n: payRows.length })}</span>
          </div>
          <div className="fn-hero-stat">
            <span className="fn-hero-stat-l">{k.avgPayment}</span>
            <span className="fn-hero-stat-v fn-num">{fmtMoney(avg)}</span>
          </div>
          {cardTotal > 0 && (
            <div className="fn-hero-stat" title={byMethod.map(([m, v]) => `${d.sales.payMethods[m as keyof typeof d.sales.payMethods]}: ${fmtMoney(v ?? 0)}`).join(' · ')}>
              <span className="fn-hero-stat-l">{k.cardIn}</span>
              <span className="fn-hero-stat-v fn-num">{fmtMoney(cardTotal)}</span>
            </div>
          )}
        </div>
      </Tilt>

      <section className="fn-panel" aria-labelledby="kassa-tl">
        <div className="fn-panel-head">
          <h2 id="kassa-tl">{k.duringDay}</h2>
          <small>{tr(plural(timeline.length, d.sales.nPayments), { n: timeline.length })}</small>
        </div>
        {timeline.length === 0 ? (
          <div className="ux-empty">
            <span className="ux-empty-ic"><Icon name="wallet" size={26} /></span>
            <b>{k.emptyTitle}</b>
            <p>{k.emptyHint}</p>
            <Link href="/app/pos" className="btn btn-tinted btn-sm">{k.addSale}</Link>
          </div>
        ) : (
          <ol className="fn-timeline">
            {timeline.map((r) => (
              <li key={r.key} className="fn-tl-item">
                <time className="fn-tl-time" dateTime={r.at.toISOString()}>{hhmm(r.at)}</time>
                <span className="fn-tl-dot" aria-hidden="true" />
                <div className="fn-tl-main">
                  <Link href={r.href} className="fn-tl-title">{r.title}</Link>
                  <span className="fn-tl-sub">{r.sub}</span>
                </div>
                <span className={`fn-tl-amount${r.out ? ' fn-tl-amount--out' : ''}`}>
                  {r.out ? '−' : '+'}{fmtMoney(Math.abs(r.amount))}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
